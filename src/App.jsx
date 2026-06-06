import { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import Login from './components/Login';
import SubmissionPage from './components/SubmissionPage';
import AttendancePage from './components/AttendancePage';
import ScheduleGrid from './components/ScheduleGrid';
import AdminDashboard from './components/AdminDashboard';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [user, setUser]         = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('submission');
  const [suspendedError, setSuspendedError] = useState('');

  useEffect(() => {
    let unsubSnapshot = null;

    const unsubAuth = onAuthStateChanged(auth, async (fu) => {
      // 前のユーザーのリスナーを解除
      if (unsubSnapshot) { unsubSnapshot(); unsubSnapshot = null; }

      if (fu) {
        setUser(fu);
        const ref = doc(db, 'users', fu.uid);

        // 初回ロード
        const snap = await getDoc(ref);
        if (snap.exists()) {
          if (snap.data().role === 'suspended') {
            setSuspendedError('このアカウントは削除されています。管理者にお問い合わせください。');
            signOut(auth);
            return;
          }
          setSuspendedError('');
          setUserData(snap.data());
        } else {
          // アカウント作成から30秒以内 → 新規登録の初回ロード（ドキュメントを作成）
          // それ以降でドキュメントが存在しない → 削除済みアカウント → 即サインアウト
          const accountAgeMs = Date.now() - new Date(fu.metadata.creationTime).getTime();
          if (accountAgeMs < 30000) {
            const d = { name: fu.displayName || fu.email.split('@')[0], email: fu.email, role: 'pending', createdAt: new Date().toISOString() };
            await setDoc(ref, d);
            setSuspendedError('');
            setUserData(d);
          } else {
            setSuspendedError('このアカウントは削除されています。管理者にお問い合わせください。');
            signOut(auth);
            return;
          }
        }
        setLoading(false);

        // リアルタイム監視：停止・削除されたら即サインアウト、ロール変更も即反映
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

  if (loading) return (
    <div className="flex items-center justify-center h-full bg-gray-50">
      <div className="text-gray-400 text-sm">読み込み中...</div>
    </div>
  );

  if (!user) return <Login suspendedError={suspendedError} />;

  // 承認待ちユーザーは専用画面を表示
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
          <span className="text-sm text-gray-300 truncate max-w-[140px]">{userData?.name}</span>
        </header>

        <main className="flex-1 overflow-hidden">
          {activeTab === 'submission' && <SubmissionPage />}
          {activeTab === 'attend'     && <AttendancePage />}
          {activeTab === 'schedule'   && isAdmin && <ScheduleGrid />}
          {activeTab === 'admin'      && isAdmin && <AdminDashboard />}
        </main>

        <nav className="bg-white border-t border-gray-200 flex flex-shrink-0">
          <TabButton active={activeTab==='submission'} onClick={()=>setActiveTab('submission')} label="申請" icon="📋" />
          <TabButton active={activeTab==='attend'}     onClick={()=>setActiveTab('attend')}     label="打刻" icon="🕐" />
          {isAdmin && <TabButton active={activeTab==='schedule'} onClick={()=>setActiveTab('schedule')} label="シフト表" icon="📊" />}
          {isAdmin && <TabButton active={activeTab==='admin'}    onClick={()=>setActiveTab('admin')}    label="管理"   icon="⚙️" />}
        </nav>
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
