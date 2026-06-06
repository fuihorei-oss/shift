import { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import Login from './components/Login';
import FloorPlanView from './components/FloorPlanView';
import CalendarPage from './components/CalendarPage';
import AttendancePage from './components/AttendancePage';
import AdminDashboard from './components/AdminDashboard';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('floor');

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const ref = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setUserData(snap.data());
        } else {
          const defaultData = {
            name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
            email: firebaseUser.email,
            role: 'staff',
            createdAt: new Date().toISOString(),
          };
          await setDoc(ref, defaultData);
          setUserData(defaultData);
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-gray-400 text-sm">読み込み中...</div>
      </div>
    );
  }

  if (!user) return <Login />;

  const isAdmin = userData?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, userData, isAdmin }}>
      <div className="flex flex-col h-full bg-gray-50">
        <header className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
          <h1 className="font-bold text-base tracking-wide">シフト管理</h1>
          <span className="text-sm text-gray-300 truncate max-w-[140px]">{userData?.name}</span>
        </header>

        <main className="flex-1 overflow-hidden">
          {activeTab === 'floor' && <FloorPlanView />}
          {activeTab === 'calendar' && <CalendarPage />}
          {activeTab === 'attend' && <AttendancePage />}
          {activeTab === 'admin' && isAdmin && <AdminDashboard />}
        </main>

        <nav className="bg-white border-t border-gray-200 flex flex-shrink-0 safe-area-bottom">
          <TabButton active={activeTab === 'floor'} onClick={() => setActiveTab('floor')} label="配置図" icon="📋" />
          <TabButton active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} label="カレンダー" icon="📅" />
          <TabButton active={activeTab === 'attend'} onClick={() => setActiveTab('attend')} label="打刻" icon="🕐" />
          {isAdmin && (
            <TabButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} label="管理" icon="⚙️" />
          )}
        </nav>
      </div>
    </AuthContext.Provider>
  );
}

function TabButton({ active, onClick, label, icon }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 flex flex-col items-center gap-0.5 text-xs transition-colors ${
        active ? 'text-blue-600 border-t-2 border-blue-600' : 'text-gray-400 border-t-2 border-transparent'
      }`}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
