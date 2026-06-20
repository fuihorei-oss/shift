import { useState, useEffect } from 'react';
import { doc, setDoc, onSnapshot, getDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';

const toDateStr = (d) => d.toLocaleDateString('sv-SE');

export const tsToTime = (ts) => {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
};

const calcDuration = (inTs, outTs, nowMs) => {
  if (!inTs) return null;
  const inMs = (inTs.toDate ? inTs.toDate() : new Date(inTs)).getTime();
  const endMs = outTs ? (outTs.toDate ? outTs.toDate() : new Date(outTs)).getTime() : nowMs;
  const diffMin = Math.round((endMs - inMs) / 60000);
  if (diffMin < 0) return null;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
};

function calcDistance(lat1,lon1,lat2,lon2){
  const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function getGPS(){
  return new Promise((res,rej)=>{
    if(!navigator.geolocation){rej(new Error('GPSに対応していません'));return;}
    navigator.geolocation.getCurrentPosition(res,()=>rej(new Error('位置情報を取得できません\n許可してください')),{timeout:10000,enableHighAccuracy:true});
  });
}
function getStoreLocations(s){
  if(!s) return [];
  if(Array.isArray(s.locations)) return s.locations;
  if(s.lat != null) return [{ name:'店舗', lat:s.lat, lng:s.lng, radius:s.radius??100 }];
  return [];
}

export default function AttendancePage() {
  const { user, userData, isAdmin } = useAuth();
  const [record,     setRecord]     = useState(null);
  const [store,      setStore]      = useState(null);
  const [todayStore, setTodayStore] = useState(''); // 今日の出勤店舗
  const [msg,        setMsg]        = useState({text:'',ok:true});
  const [loading,    setLoading]    = useState(false);
  const [monthCount, setMonthCount] = useState(0);
  const [staffList,     setStaffList]     = useState([]);
  const [todayRecords,  setTodayRecords]  = useState({});
  const [scheduledIds,  setScheduledIds]  = useState(new Set()); // 今日の出勤確定スタッフID
  const [adminLoading,  setAdminLoading]  = useState('');
  const [now,           setNow]           = useState(Date.now());
  const [targetDate,    setTargetDate]    = useState(toDateStr(new Date()));
  const [editTarget,    setEditTarget]    = useState(null); // { staff, clockIn, clockOut }
  const [editSaving,    setEditSaving]    = useState(false);
  const [shiftStores,   setShiftStores]   = useState({});
  const today = toDateStr(new Date());
  const ym = today.slice(0,7);

  useEffect(() => {
    getDoc(doc(db,'settings','store')).then(s=>{ if(s.exists()) setStore(s.data()); });
    // 今日の出勤店舗を adminOverrides から取得
    const ym = today.slice(0,7);
    getDoc(doc(db,'adminOverrides',ym)).then(s=>{
      if(!s.exists()) return;
      const stores = s.data().shiftStores ?? {};
      setTodayStore(stores[`${user.uid}_${today}`] ?? '');
    });
  },[]);

  // スタッフ自身の今日のレコードをリアルタイム購読
  useEffect(() => {
    if (isAdmin) return;
    return onSnapshot(
      doc(db,'attendance',`${user.uid}_${today}`),
      { includeMetadataChanges: false },
      s => setRecord(s.exists() ? s.data({ serverTimestamps: 'estimate' }) : null)
    );
  },[user.uid, today, isAdmin]);

  // スタッフ自身の今月出勤日数
  useEffect(()=>{
    if (isAdmin) return;
    const qy = query(collection(db,'attendance'), where('userId','==',user.uid));
    getDocs(qy).then(snap=>{
      const count = snap.docs.filter(d=>{
        const r=d.data();
        return r.date?.startsWith(ym) && r.clockInAt;
      }).length;
      setMonthCount(count);
    });
  },[user.uid, ym, isAdmin]);

  // 出勤中の経過時間を1分ごとに更新
  useEffect(()=>{
    const id = setInterval(()=>setNow(Date.now()), 60000);
    return ()=>clearInterval(id);
  },[]);

  // 管理者用：staffロールのユーザー一覧 + 対象日の出勤確定スタッフ を取得
  useEffect(()=>{
    if(!isAdmin){ setStaffList([]); setScheduledIds(new Set()); return; }
    const targetYm = targetDate.slice(0,7);
    Promise.all([
      getDocs(collection(db,'users')),
      getDoc(doc(db,'adminOverrides', targetYm)),
    ]).then(([uSnap, ovSnap]) => {
      const list = uSnap.docs
        .map(d=>({id:d.id,...d.data()}))
        .filter(s => s.role === 'staff')
        .sort((a,b)=>a.name.localeCompare(b.name,'ja'));
      setStaffList(list);

      const ovData = ovSnap.exists() ? ovSnap.data() : {};
      const overrides = ovData.overrides ?? {};
      const ids = new Set(
        list
          .filter(s => overrides[`${s.id}_${targetDate}`] === 'confirmed')
          .map(s => s.id)
      );
      setScheduledIds(ids);
      setShiftStores(ovData.shiftStores ?? {});
    });
  },[isAdmin, targetDate]);

  // 管理者用：対象日の全勤怠をリアルタイム購読
  useEffect(()=>{
    if(!isAdmin){ setTodayRecords({}); return; }
    const qy = query(collection(db,'attendance'), where('date','==',targetDate));
    return onSnapshot(qy, snap=>{
      const map={};
      snap.docs.forEach(d=>{
        const r=d.data({ serverTimestamps: 'estimate' });
        map[r.userId]=r;
      });
      setTodayRecords(map);
    });
  },[isAdmin, targetDate]);

  const staffAttendance  = staffList.map(s=>({...s, record: todayRecords[s.id]||null}));
  const workingCount    = staffAttendance.filter(s=>s.record?.clockInAt && !s.record?.clockOutAt).length;
  const scheduledCount  = scheduledIds.size;

  const verifyLocation = async () => {
    const locations = getStoreLocations(store);
    if(locations.length === 0) throw new Error('出勤場所が未設定です（管理者に設定を依頼してください）');
    const pos = await getGPS();
    let nearest = Infinity;
    for(const loc of locations){
      const dist = calcDistance(pos.coords.latitude,pos.coords.longitude,loc.lat,loc.lng);
      if(dist <= (loc.radius??100)) return {lat:pos.coords.latitude,lng:pos.coords.longitude};
      nearest = Math.min(nearest, dist);
    }
    throw new Error(`出勤場所から約${Math.round(nearest)}m離れています`);
  };

  const clockIn = async () => {
    setLoading(true); setMsg({text:'',ok:true});
    try {
      const gpsResult = await verifyLocation();
      await setDoc(doc(db,'attendance',`${user.uid}_${today}`),{
        userId:user.uid, userName:userData?.name??'', date:today,
        clockInAt:serverTimestamp(), clockInLocation:gpsResult,
        clockOutAt:null, clockOutLocation:null,
      });
      setMsg({text:'出勤しました！',ok:true});
    } catch(e){ setMsg({text:e.message,ok:false}); }
    setLoading(false);
  };

  const adminClockIn = async (staff) => {
    setAdminLoading(staff.id);
    await setDoc(doc(db,'attendance',`${staff.id}_${today}`),{
      userId:staff.id, userName:staff.name, date:today,
      clockInAt:serverTimestamp(), clockInLocation:null,
      clockOutAt:null, clockOutLocation:null,
    });
    setAdminLoading('');
  };

  const saveEdit = async () => {
    if (!editTarget || !editTarget.clockIn) return;
    setEditSaving(true);
    const toDate = (timeStr) => {
      if (!timeStr) return null;
      const [h, m] = timeStr.split(':').map(Number);
      const d = new Date(targetDate);
      d.setHours(h, m, 0, 0);
      return d;
    };
    await setDoc(doc(db, 'attendance', `${editTarget.staff.id}_${targetDate}`), {
      userId: editTarget.staff.id,
      userName: editTarget.staff.name,
      date: targetDate,
      clockInAt: toDate(editTarget.clockIn),
      clockOutAt: toDate(editTarget.clockOut),
      clockInLocation: null,
      clockOutLocation: null,
    });
    setEditSaving(false);
    setEditTarget(null);
  };

  const adminClockOut = async (staff) => {
    setAdminLoading(staff.id);
    await setDoc(doc(db,'attendance',`${staff.id}_${today}`),
      {clockOutAt:serverTimestamp()},{merge:true});
    setAdminLoading('');
  };

  // 管理者ビュー：全スタッフの出退勤管理のみ
  if (isAdmin) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex-shrink-0 flex items-center justify-between">
          <div>
            <div className="font-bold text-sm text-gray-800">
              {targetDate === today ? '今日の出勤状況' : `${targetDate.slice(5).replace('-','/')} の出勤状況`}
            </div>
            <input type="date" value={targetDate} max={today}
              onChange={e => setTargetDate(e.target.value || today)}
              className="text-xs text-blue-500 mt-0.5 bg-transparent border-none focus:outline-none cursor-pointer"/>
          </div>
          <div className="flex items-end gap-4">
            <div className="text-right">
              <div className="text-xs text-gray-400">出勤予定</div>
              <div>
                <span className="text-2xl font-bold text-blue-500">{scheduledCount}</span>
                <span className="text-xs text-gray-400 ml-0.5">人</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">出勤中</div>
              <div>
                <span className="text-2xl font-bold text-green-600">{workingCount}</span>
                <span className="text-xs text-gray-400 ml-0.5">人</span>
              </div>
            </div>
          </div>
        </div>

        {/* 打刻修正モーダル */}
        {editTarget && (
          <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={e=>e.target===e.currentTarget&&setEditTarget(null)}>
            <div className="bg-white w-full rounded-t-2xl p-6">
              <h2 className="font-bold text-base mb-0.5">打刻を修正</h2>
              <p className="text-xs text-gray-400 mb-5">{editTarget.staff.name} — {targetDate}</p>
              <div className="space-y-4 mb-5">
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">出勤時刻</label>
                  <input type="time" value={editTarget.clockIn}
                    onChange={e => setEditTarget(p => ({...p, clockIn: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">退勤時刻（未退勤の場合は空欄）</label>
                  <input type="time" value={editTarget.clockOut}
                    onChange={e => setEditTarget(p => ({...p, clockOut: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditTarget(null)}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold">
                  キャンセル
                </button>
                <button onClick={saveEdit} disabled={editSaving || !editTarget.clockIn}
                  className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
                  {editSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {staffList.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">読み込み中...</div>
          ) : (
            staffAttendance.map(s => {
              const rec = s.record;
              const isBusy = adminLoading === s.id;
              const status = !rec?.clockInAt ? 'none' : !rec?.clockOutAt ? 'in' : 'out';
              const dur = calcDuration(rec?.clockInAt, rec?.clockOutAt, now);
              const isToday = targetDate === today;
              const store = shiftStores[`${s.id}_${targetDate}`];
              return (
                <div key={s.id} className="flex items-center justify-between px-4 py-3 bg-white">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-800">{s.name}</span>
                      {store && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${store === 'Virgo' ? 'bg-purple-100 text-purple-700' : 'bg-pink-100 text-pink-700'}`}>
                          {store}
                        </span>
                      )}
                    </div>
                    <div className="text-xs mt-0.5">
                      {status === 'none' && <span className="text-gray-400">未出勤</span>}
                      {status === 'in'   && (
                        <span className="text-green-600 font-medium">
                          出勤中 {tsToTime(rec.clockInAt)}
                          {dur && <span className="text-green-400 ml-1">({dur})</span>}
                        </span>
                      )}
                      {status === 'out'  && (
                        <span className="text-blue-500">
                          {tsToTime(rec.clockInAt)} → {tsToTime(rec.clockOutAt)}
                          {dur && <span className="text-gray-400 ml-1">({dur})</span>}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditTarget({
                        staff: s,
                        clockIn:  rec?.clockInAt  ? tsToTime(rec.clockInAt)  : '',
                        clockOut: rec?.clockOutAt ? tsToTime(rec.clockOutAt) : '',
                      })}
                      className="text-xs border border-gray-200 text-gray-500 px-2.5 py-1.5 rounded-lg active:bg-gray-50">
                      修正
                    </button>
                    {isToday && status === 'none' && (
                      <button onClick={()=>adminClockIn(s)} disabled={isBusy}
                        className="bg-green-500 text-white text-xs px-4 py-2 rounded-xl font-semibold disabled:opacity-50 active:bg-green-600">
                        {isBusy ? '...' : '出勤'}
                      </button>
                    )}
                    {isToday && status === 'in' && (
                      <button onClick={()=>adminClockOut(s)} disabled={isBusy}
                        className="bg-red-500 text-white text-xs px-4 py-2 rounded-xl font-semibold disabled:opacity-50 active:bg-red-600">
                        {isBusy ? '...' : '退勤'}
                      </button>
                    )}
                    {isToday && status === 'out' && (
                      <span className="text-xs text-gray-300 font-medium">完了</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // スタッフビュー
  const isClockedIn  = !!record?.clockInAt;
  const isClockedOut = !!record?.clockOutAt;
  const clockInTime  = tsToTime(record?.clockInAt);
  const clockOutTime = tsToTime(record?.clockOutAt);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 今日の自分のステータス */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <div className="text-gray-400 text-xs mb-1">{today} — {userData?.name}</div>
          {todayStore && (
            <div className="mb-2">
              <span className={`inline-block text-sm font-bold px-4 py-1 rounded-full ${todayStore === 'Virgo' ? 'bg-purple-100 text-purple-700' : 'bg-pink-100 text-pink-700'}`}>
                {todayStore}
              </span>
            </div>
          )}
          {!isClockedIn && (
            <><div className="text-4xl my-2">🕐</div><div className="text-gray-400 text-sm">まだ出勤していません</div></>
          )}
          {isClockedIn && !isClockedOut && (
            <><div className="text-4xl my-2">✅</div>
            <div className="text-2xl font-bold">{clockInTime}</div>
            <div className="text-green-600 text-sm font-medium mt-1">出勤中</div></>
          )}
          {isClockedOut && (
            <><div className="text-4xl my-2">🏁</div>
            <div className="flex justify-center gap-8 mt-1">
              <div><div className="text-xs text-gray-400">出勤</div><div className="font-bold text-lg">{clockInTime}</div></div>
              <div><div className="text-xs text-gray-400">退勤</div><div className="font-bold text-lg">{clockOutTime}</div></div>
            </div>
            <div className="text-gray-400 text-sm mt-2">本日の勤務終了</div></>
          )}
        </div>

        {/* 今月の出勤日数 */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
          <span className="text-sm text-gray-600">今月の出勤日数</span>
          <span className="text-2xl font-bold text-blue-600">{monthCount}<span className="text-sm text-gray-400 font-normal ml-1">日</span></span>
        </div>

        {/* メッセージ */}
        {msg.text && (
          <div className={`rounded-xl p-3 text-sm text-center whitespace-pre-line ${msg.ok?'bg-green-50 text-green-700':'bg-red-50 text-red-600'}`}>
            {msg.text}
          </div>
        )}

        {/* 出勤ボタン */}
        {!isClockedIn && !isClockedOut && (
          <button onClick={clockIn} disabled={loading}
            className="w-full py-5 rounded-2xl bg-green-500 text-white text-xl font-bold shadow-md disabled:opacity-50 active:scale-95 transition-transform">
            {loading ? '確認中...' : '出勤する'}
          </button>
        )}
        {isClockedIn && !isClockedOut && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center text-sm text-yellow-700">
            退勤は管理者が操作します
          </div>
        )}

        <p className="text-center text-xs text-gray-400">
          📍 GPS（{getStoreLocations(store).length > 0 ? `登録場所 ${getStoreLocations(store).length} 件` : '未設定'}）— 出勤場所付近で出勤登録
        </p>
      </div>
    </div>
  );
}
