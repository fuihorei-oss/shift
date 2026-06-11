import { useState, useEffect, useCallback } from 'react';
import { doc, setDoc, onSnapshot, getDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';

const toDateStr = (d) => d.toLocaleDateString('sv-SE');

// Firestore Timestamp・ISO文字列・null のいずれでも "HH:MM" に変換
export const tsToTime = (ts) => {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
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

export default function AttendancePage() {
  const { user, userData, isAdmin } = useAuth();
  const [record,  setRecord]  = useState(null);
  const [store,   setStore]   = useState(null);
  const [msg,     setMsg]     = useState({text:'',ok:true});
  const [loading, setLoading] = useState(false);
  const [monthCount, setMonthCount] = useState(0);
  const [staffAttendance, setStaffAttendance] = useState([]);
  const [adminLoading, setAdminLoading] = useState('');
  const today = toDateStr(new Date());
  const ym = today.slice(0,7);

  useEffect(() => {
    getDoc(doc(db,'settings','store')).then(s=>{ if(s.exists()) setStore(s.data()); });
  },[]);

  // サーバータイムスタンプが pending 中も推定値で表示するため estimate を使用
  useEffect(() => {
    return onSnapshot(
      doc(db,'attendance',`${user.uid}_${today}`),
      { includeMetadataChanges: false },
      s => setRecord(s.exists() ? s.data({ serverTimestamps: 'estimate' }) : null)
    );
  },[user.uid, today]);

  useEffect(()=>{
    getDocs(collection(db,'attendance')).then(snap=>{
      const count = snap.docs.filter(d=>{
        const r=d.data();
        return r.userId===user.uid && r.date?.startsWith(ym) && r.clockInAt;
      }).length;
      setMonthCount(count);
    });
  },[user.uid, ym]);

  const loadAdminData = useCallback(async () => {
    if(!isAdmin) return;
    const [aSnap, uSnap] = await Promise.all([
      getDocs(collection(db,'attendance')),
      getDocs(collection(db,'users')),
    ]);
    const approved = uSnap.docs
      .map(d=>({id:d.id,...d.data()}))
      .filter(s=>['staff','admin'].includes(s.role))
      .sort((a,b)=>a.name.localeCompare(b.name,'ja'));
    const todayMap = {};
    aSnap.docs.forEach(d=>{
      const r=d.data({ serverTimestamps: 'estimate' });
      if(r.date===today) todayMap[r.userId]=r;
    });
    setStaffAttendance(approved.map(s=>({...s, record: todayMap[s.id]||null})));
  },[isAdmin, today]);

  useEffect(()=>{
    loadAdminData();
    const iv = setInterval(loadAdminData, 30000);
    return ()=>clearInterval(iv);
  },[loadAdminData]);

  const verifyLocation = async () => {
    if(!store?.lat) throw new Error('店舗位置が未設定です（管理者に設定を依頼してください）');
    const pos = await getGPS();
    const dist = calcDistance(pos.coords.latitude,pos.coords.longitude,store.lat,store.lng);
    if(dist>(store.radius??100)) throw new Error(`店舗から約${Math.round(dist)}m離れています`);
    return {lat:pos.coords.latitude,lng:pos.coords.longitude};
  };

  const verifyWifi = async () => {
    if(!store?.wifiIp) throw new Error('店舗WiFiが未設定です（管理者に設定を依頼してください）');
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const { ip } = await res.json();
      if(ip !== store.wifiIp) throw new Error('mismatch');
      return ip;
    } catch(e) {
      if(e.message==='mismatch') throw new Error('店舗WiFiに接続してください');
      throw new Error('IPアドレスを確認できません');
    }
  };

  const clockIn = async () => {
    setLoading(true); setMsg({text:'',ok:true});
    try {
      // GPS と WiFi の両方が必須
      const [gpsResult, wifiResult] = await Promise.allSettled([
        verifyLocation(),
        verifyWifi(),
      ]);
      const gpsOk  = gpsResult.status  === 'fulfilled';
      const wifiOk = wifiResult.status === 'fulfilled';
      if (!gpsOk || !wifiOk) {
        const lines = [];
        if (!gpsOk)  lines.push(`📍 GPS: ${gpsResult.reason.message}`);
        if (!wifiOk) lines.push(`📶 WiFi: ${wifiResult.reason.message}`);
        throw new Error(`出勤できませんでした\n${lines.join('\n')}`);
      }
      await setDoc(doc(db,'attendance',`${user.uid}_${today}`),{
        userId:user.uid, userName:userData?.name??'', date:today,
        clockInAt:serverTimestamp(), clockInLocation:gpsResult.value,
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
    await loadAdminData();
    setAdminLoading('');
  };

  const adminClockOut = async (staff) => {
    setAdminLoading(staff.id);
    await setDoc(doc(db,'attendance',`${staff.id}_${today}`),
      {clockOutAt:serverTimestamp()},{merge:true});
    await loadAdminData();
    setAdminLoading('');
  };

  const isClockedIn  = !!record?.clockInAt;
  const isClockedOut = !!record?.clockOutAt;

  const clockInTime  = tsToTime(record?.clockInAt);
  const clockOutTime = tsToTime(record?.clockOutAt);

  const workingCount = staffAttendance.filter(s=>s.record?.clockInAt && !s.record?.clockOutAt).length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 今日の自分のステータス */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <div className="text-gray-400 text-xs mb-1">{today} — {userData?.name}</div>
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
          📍 GPS（{store?.lat ? `${store.radius??100}m以内` : '未設定'}）かつ 📶 店舗WiFi — 両方必須
        </p>

        {/* 管理者: 全スタッフの出勤状況 */}
        {isAdmin && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-sm">
                今日の出勤状況
                <span className="ml-2 text-xs font-normal text-gray-400">{workingCount}人出勤中</span>
              </div>
              <button onClick={loadAdminData}
                className="text-xs text-blue-500 px-2 py-1 rounded-lg border border-blue-200 active:bg-blue-50">
                更新
              </button>
            </div>

            {staffAttendance.length === 0 ? (
              <p className="text-gray-400 text-sm">読み込み中...</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {staffAttendance.map(s => {
                  const rec = s.record;
                  const isBusy = adminLoading === s.id;
                  const status = !rec?.clockInAt ? 'none' : !rec?.clockOutAt ? 'in' : 'out';
                  return (
                    <div key={s.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="font-medium text-sm">{s.name}</div>
                        <div className="text-xs mt-0.5">
                          {status === 'none' && <span className="text-gray-400">未出勤</span>}
                          {status === 'in'   && <span className="text-green-600">出勤中 {tsToTime(rec.clockInAt)}</span>}
                          {status === 'out'  && <span className="text-blue-500">{tsToTime(rec.clockInAt)} → {tsToTime(rec.clockOutAt)}</span>}
                        </div>
                      </div>
                      <div>
                        {status === 'none' && (
                          <button onClick={()=>adminClockIn(s)} disabled={isBusy}
                            className="bg-green-500 text-white text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 active:bg-green-600">
                            {isBusy ? '...' : '出勤登録'}
                          </button>
                        )}
                        {status === 'in' && (
                          <button onClick={()=>adminClockOut(s)} disabled={isBusy}
                            className="bg-red-500 text-white text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 active:bg-red-600">
                            {isBusy ? '...' : '退勤登録'}
                          </button>
                        )}
                        {status === 'out' && (
                          <span className="text-xs text-gray-300">完了</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
