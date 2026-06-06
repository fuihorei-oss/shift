import { useState, useEffect } from 'react';
import { doc, setDoc, onSnapshot, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';

const toDateStr = (d) => d.toLocaleDateString('sv-SE');
const nowTime = () => new Date().toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' });

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
  // Admin: clocked-in staff list
  const [clockedIn, setClockedIn] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const today = toDateStr(new Date());
  const ym = today.slice(0,7);

  useEffect(() => {
    getDoc(doc(db,'settings','store')).then(s=>{ if(s.exists()) setStore(s.data()); });
  },[]);

  // 自分の今日の打刻
  useEffect(() => {
    return onSnapshot(doc(db,'attendance',`${user.uid}_${today}`), s=>
      setRecord(s.exists()?s.data():null)
    );
  },[user.uid, today]);

  // 今月の出勤日数
  useEffect(()=>{
    getDocs(collection(db,'attendance')).then(snap=>{
      const count = snap.docs.filter(d=>{
        const r=d.data();
        return r.userId===user.uid && r.date?.startsWith(ym) && r.clockIn;
      }).length;
      setMonthCount(count);
    });
  },[user.uid, ym]);

  // 管理者: 現在出勤中のスタッフ
  useEffect(()=>{
    if(!isAdmin) return;
    const loadClocked = async () => {
      const [aSnap, uSnap] = await Promise.all([
        getDocs(collection(db,'attendance')),
        getDocs(collection(db,'users')),
      ]);
      const staff = uSnap.docs.map(d=>({id:d.id,...d.data()}));
      setStaffList(staff);
      const inList = aSnap.docs
        .map(d=>d.data())
        .filter(r=>r.date===today && r.clockIn && !r.clockOut);
      setClockedIn(inList);
    };
    loadClocked();
    const interval = setInterval(loadClocked, 30000);
    return ()=>clearInterval(interval);
  },[isAdmin, today]);

  const verifyLocation = async () => {
    if(!store?.lat) return null;
    const pos = await getGPS();
    const dist = calcDistance(pos.coords.latitude,pos.coords.longitude,store.lat,store.lng);
    if(dist>(store.radius??100)) throw new Error(`店舗から約${Math.round(dist)}m離れています`);
    return {lat:pos.coords.latitude,lng:pos.coords.longitude};
  };

  const clockIn = async () => {
    setLoading(true); setMsg({text:'',ok:true});
    try {
      const loc = await verifyLocation();
      const time = nowTime();
      await setDoc(doc(db,'attendance',`${user.uid}_${today}`),{
        userId:user.uid, userName:userData?.name??'', date:today,
        clockIn:time, clockInAt:new Date().toISOString(), clockInLocation:loc,
        clockOut:null, clockOutAt:null, clockOutLocation:null,
      });
      setMsg({text:`出勤しました！ ${time}`,ok:true});
    } catch(e){ setMsg({text:e.message,ok:false}); }
    setLoading(false);
  };

  // 管理者が特定スタッフの退勤を打刻
  const adminClockOut = async (staffRecord) => {
    const time = nowTime();
    await setDoc(doc(db,'attendance',`${staffRecord.userId}_${today}`),
      {clockOut:time, clockOutAt:new Date().toISOString()},{merge:true});
    setClockedIn(p=>p.filter(r=>r.userId!==staffRecord.userId));
  };

  const isClockedIn  = !!record?.clockIn;
  const isClockedOut = !!record?.clockOut;

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
            <div className="text-2xl font-bold">{record.clockIn}</div>
            <div className="text-green-600 text-sm font-medium mt-1">出勤中</div></>
          )}
          {isClockedOut && (
            <><div className="text-4xl my-2">🏁</div>
            <div className="flex justify-center gap-8 mt-1">
              <div><div className="text-xs text-gray-400">出勤</div><div className="font-bold text-lg">{record.clockIn}</div></div>
              <div><div className="text-xs text-gray-400">退勤</div><div className="font-bold text-lg">{record.clockOut}</div></div>
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

        {/* 出勤ボタン（退勤は管理者操作） */}
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

        {store?.lat && <p className="text-center text-xs text-gray-400">📍 GPS で位置を確認します（{store.radius??100}m 以内）</p>}
        {!store?.lat && <p className="text-center text-xs text-orange-400">⚠ 店舗位置が未設定です</p>}

        {/* 管理者: 現在出勤中スタッフ */}
        {isAdmin && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="font-bold text-sm mb-3">現在出勤中（{clockedIn.length}人）</div>
            {clockedIn.length===0 ? (
              <p className="text-gray-400 text-sm">現在出勤中のスタッフはいません</p>
            ) : (
              <div className="space-y-2">
                {clockedIn.map(r=>(
                  <div key={r.userId} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="font-medium text-sm">{r.userName}</div>
                      <div className="text-xs text-gray-400">出勤 {r.clockIn}</div>
                    </div>
                    <button onClick={()=>adminClockOut(r)}
                      className="bg-red-500 text-white text-xs px-3 py-1.5 rounded-lg font-semibold active:bg-red-600">
                      退勤させる
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
