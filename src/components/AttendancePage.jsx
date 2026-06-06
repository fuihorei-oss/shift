import { useState, useEffect } from 'react';
import { doc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';

const toDateStr = (d) => d.toLocaleDateString('sv-SE');

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('このデバイスはGPSに対応していません'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, () =>
      reject(new Error('位置情報を取得できませんでした\nブラウザの位置情報を許可してください')),
      { timeout: 10000, enableHighAccuracy: true }
    );
  });
}

export default function AttendancePage() {
  const { user, userData } = useAuth();
  const [record, setRecord] = useState(null);
  const [store, setStore] = useState(null);
  const [msg, setMsg] = useState({ text: '', ok: true });
  const [loading, setLoading] = useState(false);
  const today = toDateStr(new Date());
  const nowTime = () =>
    new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    getDoc(doc(db, 'settings', 'store')).then((s) => {
      if (s.exists()) setStore(s.data());
    });
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, 'attendance', `${user.uid}_${today}`), (s) =>
      setRecord(s.exists() ? s.data() : null)
    );
  }, [user.uid, today]);

  const verifyLocation = async () => {
    if (!store?.lat) return null; // 店舗未設定はスキップ
    const pos = await getGPS();
    const dist = calcDistance(pos.coords.latitude, pos.coords.longitude, store.lat, store.lng);
    if (dist > (store.radius ?? 100)) {
      throw new Error(`店舗から約${Math.round(dist)}m離れています\n店舗近くで打刻してください`);
    }
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  };

  const clockIn = async () => {
    setLoading(true);
    setMsg({ text: '', ok: true });
    try {
      const loc = await verifyLocation();
      const time = nowTime();
      await setDoc(doc(db, 'attendance', `${user.uid}_${today}`), {
        userId: user.uid,
        userName: userData?.name ?? '',
        date: today,
        clockIn: time,
        clockInAt: new Date().toISOString(),
        clockInLocation: loc,
        clockOut: null,
        clockOutAt: null,
        clockOutLocation: null,
      });
      setMsg({ text: `出勤しました！ ${time}`, ok: true });
    } catch (e) {
      setMsg({ text: e.message, ok: false });
    }
    setLoading(false);
  };

  const clockOut = async () => {
    setLoading(true);
    setMsg({ text: '', ok: true });
    try {
      const loc = await verifyLocation();
      const time = nowTime();
      await setDoc(
        doc(db, 'attendance', `${user.uid}_${today}`),
        { clockOut: time, clockOutAt: new Date().toISOString(), clockOutLocation: loc },
        { merge: true }
      );
      setMsg({ text: `退勤しました！ ${time}`, ok: true });
    } catch (e) {
      setMsg({ text: e.message, ok: false });
    }
    setLoading(false);
  };

  const isClockedIn  = !!record?.clockIn;
  const isClockedOut = !!record?.clockOut;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        {/* 日付・名前 */}
        <div className="text-center mb-5">
          <div className="text-gray-400 text-xs">{today}</div>
          <div className="font-bold text-lg mt-0.5">{userData?.name}</div>
        </div>

        {/* ステータスカード */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4 text-center">
          {!isClockedIn && (
            <>
              <div className="text-5xl mb-3">🕐</div>
              <div className="text-gray-400 text-sm">まだ出勤していません</div>
            </>
          )}
          {isClockedIn && !isClockedOut && (
            <>
              <div className="text-5xl mb-2">✅</div>
              <div className="text-2xl font-bold text-gray-800">{record.clockIn}</div>
              <div className="text-green-600 text-sm mt-1 font-medium">出勤中</div>
            </>
          )}
          {isClockedOut && (
            <>
              <div className="text-5xl mb-3">🏁</div>
              <div className="flex justify-center gap-10">
                <div>
                  <div className="text-xs text-gray-400 mb-1">出勤</div>
                  <div className="text-xl font-bold">{record.clockIn}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">退勤</div>
                  <div className="text-xl font-bold">{record.clockOut}</div>
                </div>
              </div>
              <div className="text-gray-400 text-sm mt-3">本日の勤務終了</div>
            </>
          )}
        </div>

        {/* メッセージ */}
        {msg.text && (
          <div
            className={`rounded-xl p-3 mb-4 text-sm text-center whitespace-pre-line ${
              msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* ボタン */}
        {!isClockedOut && (
          <button
            onClick={isClockedIn ? clockOut : clockIn}
            disabled={loading}
            className={`w-full py-5 rounded-2xl text-white text-xl font-bold shadow-md
              disabled:opacity-50 active:scale-95 transition-transform mt-auto ${
              isClockedIn
                ? 'bg-red-500 active:bg-red-600'
                : 'bg-green-500 active:bg-green-600'
            }`}
          >
            {loading ? '確認中...' : isClockedIn ? '退勤する' : '出勤する'}
          </button>
        )}

        {/* 注記 */}
        <p className="text-center text-xs mt-3">
          {store?.lat ? (
            <span className="text-gray-400">📍 GPS で位置を確認します（{store.radius ?? 100}m 以内）</span>
          ) : (
            <span className="text-orange-400">⚠ 店舗位置が未設定です（管理者が設定してください）</span>
          )}
        </p>
      </div>
    </div>
  );
}
