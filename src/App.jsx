import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { onAuthStateChanged, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import Login from './components/Login';
import SubmissionPage from './components/SubmissionPage';
import AttendancePage from './components/AttendancePage';
import ScheduleGrid from './components/ScheduleGrid';
import AdminDashboard from './components/AdminDashboard';
import StaffSchedule from './components/StaffSchedule';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [user, setUser]         = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('submission');
  const [suspendedError, setSuspendedError] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [pwResetMsg,  setPwResetMsg]  = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let unsubSnapshot = null;

    const unsubAuth = onAuthStateChanged(auth, async (fu) => {
      if (unsubSnapshot) { unsubSnapshot(); unsubSnapshot = null; }

      if (fu) {
        setUser(fu);
        const ref = doc(db, 'users', fu.uid);

        const snap = await getDoc(ref);
        if (snap.exists()) {
          if (snap.data().role === 'suspended') {
            setSuspendedError('このアカウントは削除されています。管理者にお問い合わせください。');
            signOut(auth);
            return;
          }
          setSuspendedError('');
          setUserData(snap.data());
          // 管理者は申請・打刻タブを使わないので初期タブをシフト表に設定
          if (snap.data().role === 'admin') setActiveTab('schedule');
        } else {
          const d = { name: fu.displayName || fu.email.split('@')[0], email: fu.email, role: 'pending', createdAt: new Date().toISOString() };
          await setDoc(ref, d);
          setSuspendedError('');
          setUserData(d);
        }
        setLoading(false);

        unsubSnapshot = onSnapshot(ref, (snap) => {
          if (!snap.exists() || snap.data().role === 'suspended') {
            setSuspendedError('このアカウントは削除されています。管理者にお問い合わせください。');
            signOut(auth);
          } else {
            setUserData(snap.data());
          }
        });
      } else {
        setUser(null); setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`);
      if (!res.ok) return;
      const { version } = await res.json();
      if (version !== __APP_VERSION__) setUpdateAvailable(true);
    } catch {}
  }, []);

  useEffect(() => {
    checkVersion();
    const onVisible = () => { if (document.visibilityState === 'visible') checkVersion(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [checkVersion]);

  if (loading) return (
    <div className="flex items-center justify-center h-full bg-gray-50">
      <div className="text-gray-400 text-sm">読み込み中...</div>
    </div>
  );

  if (!user) return <Login suspendedError={suspendedError} />;

  if (userData?.role === 'pending') {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        <header className="bg-gray-900 text-white px-4 py-3 flex-shrink-0">
          <h1 className="font-bold text-base tracking-wide">シフト管理</h1>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-5xl mb-5">⏳</div>
            <h2 className="font-bold text-lg mb-2 text-gray-800">承認待ちです</h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              管理者がアカウントを承認するまで<br/>しばらくお待ちください
            </p>
            <button
              onClick={() => signOut(auth)}
              className="mt-8 text-sm text-gray-400 underline underline-offset-2">
              サインアウト
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = userData?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, userData, isAdmin }}>
      <div className="flex flex-col h-full bg-gray-50">
        <header className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-baseline gap-2">
            <h1 className="font-bold text-base tracking-wide">シフト管理</h1>
            <span className="text-xs text-gray-400">v{__APP_VERSION__}</span>
          </div>
          <button
            onClick={() => setShowUserMenu(true)}
            className="flex items-center gap-1.5 active:opacity-70">
            <span className="text-sm text-gray-300 truncate max-w-[120px]">{userData?.name}</span>
            <span className="text-gray-500 text-xs">▼</span>
          </button>
        </header>

        {updateAvailable && (
          <div className="bg-blue-600 text-white text-sm py-2 px-4 flex items-center justify-center gap-3 flex-shrink-0">
            <span>新しいバージョンがあります</span>
            <button
              onClick={() => window.location.reload()}
              className="bg-white text-blue-600 text-xs font-bold px-3 py-1 rounded-full active:opacity-80">
              今すぐ更新
            </button>
          </div>
        )}

        <main className="flex-1 overflow-hidden">
          {activeTab === 'submission' && !isAdmin && <SubmissionPage />}
          {activeTab === 'attend'                 && <AttendancePage />}
          {activeTab === 'myshift'    && !isAdmin && <StaffSchedule />}
          {activeTab === 'schedule'   && isAdmin  && <ScheduleGrid />}
          {activeTab === 'admin'      && isAdmin  && <AdminDashboard />}
        </main>

        <nav className="bg-white border-t border-gray-200 flex flex-shrink-0">
          {!isAdmin && <TabButton active={activeTab==='submission'} onClick={()=>setActiveTab('submission')} label="申請" icon="📋" />}
          <TabButton active={activeTab==='attend'} onClick={()=>setActiveTab('attend')} label="打刻" icon="🕐" />
          {!isAdmin && <TabButton active={activeTab==='myshift'}  onClick={()=>setActiveTab('myshift')}  label="シフト" icon="📅" />}
          {isAdmin  && <TabButton active={activeTab==='schedule'} onClick={()=>setActiveTab('schedule')} label="シフト表" icon="📊" />}
          {isAdmin  && <TabButton active={activeTab==='admin'}    onClick={()=>setActiveTab('admin')}    label="管理" icon="⚙️" />}
        </nav>

        {showUserMenu && (
          <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setShowUserMenu(false)}>
            <div className="bg-white w-full rounded-t-2xl p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-5 pb-5 border-b border-gray-100">
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-base flex-shrink-0">
                  {userData?.name?.[0] ?? '?'}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{userData?.name}</div>
                  <div className="text-xs text-gray-400 truncate">{user?.email}</div>
                  <span className={`mt-0.5 inline-block text-[10px] px-2 py-0.5 rounded-full ${isAdmin ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                    {isAdmin ? '管理者' : 'スタッフ'}
                  </span>
                </div>
              </div>
              {pwResetMsg ? (
                <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm text-center">
                  {pwResetMsg}
                </div>
              ) : (
                <button
                  onClick={async () => {
                    await sendPasswordResetEmail(auth, user.email);
                    setPwResetMsg('パスワードリセットメールを送信しました');
                  }}
                  className="w-full py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold active:bg-gray-50 mb-2">
                  パスワードを変更
                </button>
              )}
              <button
                onClick={() => { setShowUserMenu(false); signOut(auth); }}
                className="w-full py-3 rounded-xl border border-red-200 text-red-500 text-sm font-semibold active:bg-red-50">
                サインアウト
              </button>
              <button
                onClick={() => { setShowUserMenu(false); setPwResetMsg(''); }}
                className="mt-2 w-full py-3 rounded-xl border border-gray-200 text-gray-400 text-sm">
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    </AuthContext.Provider>
  );
}

function TabButton({ active, onClick, label, icon }) {
  return (
    <button onClick={onClick}
      className={`flex-1 py-2 flex flex-col items-center gap-0.5 text-xs transition-colors ${
        active ? 'text-blue-600 border-t-2 border-blue-600' : 'text-gray-400 border-t-2 border-transparent'
      }`}>
      <span className="text-lg leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
