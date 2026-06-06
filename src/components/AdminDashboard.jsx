import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, auth, getSecondaryAuth } from '../firebase';
import { useAuth } from '../App';

const toDateStr = (d) => d.toLocaleDateString('sv-SE');

// ─── サブタブ定義 ──────────────────────────────────
const TABS = [
  { id: 'staff',    label: 'スタッフ' },
  { id: 'attend',   label: '出勤管理' },
  { id: 'store',    label: '店舗設定' },
];

export default function AdminDashboard() {
  const [tab, setTab] = useState('staff');
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* サブタブ */}
      <div className="flex border-b border-gray-100 bg-white flex-shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              tab === t.id ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'staff'  && <StaffTab />}
        {tab === 'attend' && <AttendTab />}
        {tab === 'store'  && <StoreTab />}
      </div>
    </div>
  );
}

// ─── スタッフ管理 ──────────────────────────────────
function StaffTab() {
  const { user } = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () =>
    getDocs(collection(db, 'users')).then((snap) =>
      setStaffList(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

  useEffect(() => { load(); }, []);

  const addStaff = async () => {
    if (!form.name || !form.email || !form.password) { setError('全て入力してください'); return; }
    setError(''); setLoading(true);
    try {
      const sa = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(sa, form.email, form.password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: form.name, email: form.email, role: form.role,
        createdAt: new Date().toISOString(),
      });
      await signOut(sa);
      setShowModal(false);
      setForm({ name: '', email: '', password: '', role: 'staff' });
      await load();
    } catch (e) {
      const m = { 'auth/email-already-in-use': 'このメールは使用済みです', 'auth/weak-password': '6文字以上にしてください' };
      setError(m[e.code] ?? e.message);
    }
    setLoading(false);
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-base">スタッフ管理</h2>
        <button onClick={() => { setShowModal(true); setError(''); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">
          ＋ 追加
        </button>
      </div>

      <div className="space-y-2">
        {staffList.map((s) => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{s.name}</div>
              <div className="text-xs text-gray-400 truncate">{s.email}</div>
              <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full ${
                s.role === 'admin' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
              }`}>{s.role === 'admin' ? '管理者' : 'スタッフ'}</span>
            </div>
            {s.id !== useAuth().user.uid && (
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button onClick={() => updateDoc(doc(db, 'users', s.id), { role: s.role === 'admin' ? 'staff' : 'admin' }).then(load)}
                  className="text-xs border border-gray-200 px-2 py-1 rounded-lg text-gray-600 whitespace-nowrap">
                  {s.role === 'admin' ? 'スタッフに変更' : '管理者に変更'}
                </button>
                <button onClick={() => window.confirm('削除しますか？') && deleteDoc(doc(db, 'users', s.id)).then(load)}
                  className="text-xs border border-red-200 px-2 py-1 rounded-lg text-red-500 whitespace-nowrap">
                  削除
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <button onClick={() => signOut(auth)} className="mt-6 w-full py-3 border border-gray-200 rounded-xl text-gray-500 text-sm">
        サインアウト
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white w-full rounded-t-2xl p-6">
            <h2 className="font-bold text-base mb-4">スタッフを追加</h2>
            {error && <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{error}</div>}
            <div className="space-y-3 mb-5">
              {[['名前','name','text','山田 太郎'],['メールアドレス','email','email','email@example.com'],['パスワード','password','password','6文字以上']].map(([label,key,type,ph]) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                  <input type={type} value={form[key]} placeholder={ph}
                    onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">権限</label>
                <select value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none">
                  <option value="staff">スタッフ</option>
                  <option value="admin">管理者</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold">キャンセル</button>
              <button onClick={addStaff} disabled={loading} className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
                {loading ? '追加中...' : '追加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 出勤管理 ──────────────────────────────────────
function AttendTab() {
  const [date, setDate] = useState(toDateStr(new Date()));
  const [records, setRecords] = useState([]);
  const [staffList, setStaffList] = useState([]);

  useEffect(() => {
    getDocs(collection(db, 'users')).then((snap) =>
      setStaffList(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  useEffect(() => {
    getDocs(collection(db, 'attendance')).then((snap) => {
      setRecords(
        snap.docs
          .map((d) => d.data())
          .filter((r) => r.date === date)
      );
    });
  }, [date]);

  const getRecord = (userId) => records.find((r) => r.userId === userId);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-base">出勤管理</h2>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
      </div>

      <div className="space-y-2">
        {staffList.map((s) => {
          const rec = getRecord(s.id);
          return (
            <div key={s.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{s.name}</div>
                <div className="text-xs text-gray-400">{s.email}</div>
              </div>
              <div className="text-right">
                {!rec ? (
                  <span className="text-xs text-gray-300">未出勤</span>
                ) : !rec.clockOut ? (
                  <div>
                    <div className="text-xs text-green-600 font-medium">出勤中</div>
                    <div className="text-sm font-bold">{rec.clockIn}</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs text-gray-400">
                      {rec.clockIn} → {rec.clockOut}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">退勤済み</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 店舗設定（GPS基準点） ─────────────────────────
function StoreTab() {
  const [store, setStore] = useState({ lat: null, lng: null, radius: 100 });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'settings', 'store')).then((s) => {
      if (s.exists()) setStore(s.data());
    });
  }, []);

  const setCurrentLocation = () => {
    setMsg('');
    if (!navigator.geolocation) { setMsg('GPSが利用できません'); return; }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStore((s) => ({ ...s, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        setSaved(false);
        setLoading(false);
        setMsg('現在地を取得しました。「保存」を押して確定してください。');
      },
      () => { setMsg('位置情報の取得に失敗しました'); setLoading(false); }
    );
  };

  const save = async () => {
    await setDoc(doc(db, 'settings', 'store'), store);
    setSaved(true);
    setMsg('保存しました！');
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className="font-bold text-base mb-1">店舗設定</h2>
      <p className="text-xs text-gray-400 mb-5">出勤打刻時の GPS 基準位置を設定します</p>

      {/* 現在地 */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <div className="text-sm font-medium text-gray-700 mb-3">店舗の位置</div>
        {store.lat ? (
          <div className="text-xs text-gray-500 mb-3 space-y-1">
            <div>緯度: {store.lat.toFixed(6)}</div>
            <div>経度: {store.lng.toFixed(6)}</div>
          </div>
        ) : (
          <div className="text-xs text-orange-400 mb-3">未設定</div>
        )}
        <button onClick={setCurrentLocation} disabled={loading}
          className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
          {loading ? '取得中...' : '📍 現在地を店舗位置に設定'}
        </button>
      </div>

      {/* 許容範囲 */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <div className="text-sm font-medium text-gray-700 mb-1">許容範囲</div>
        <p className="text-xs text-gray-400 mb-3">この距離（m）以内でのみ打刻可能</p>
        <div className="flex items-center gap-3">
          <input type="range" min="50" max="500" step="50" value={store.radius}
            onChange={(e) => { setStore((s) => ({ ...s, radius: Number(e.target.value) })); setSaved(false); }}
            className="flex-1" />
          <span className="text-sm font-bold w-16 text-right">{store.radius} m</span>
        </div>
      </div>

      {msg && (
        <div className={`rounded-xl p-3 mb-4 text-sm text-center ${
          saved || msg.includes('取得') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}>{msg}</div>
      )}

      <button onClick={save}
        className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold active:bg-gray-700">
        保存
      </button>
    </div>
  );
}
