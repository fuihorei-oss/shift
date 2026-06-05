import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, auth, getSecondaryAuth } from '../firebase';
import { useAuth } from '../App';

export default function AdminDashboard() {
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
    setError('');
    setLoading(true);
    try {
      // サブアプリで作成して現在のセッションを維持
      const secondaryAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email, form.password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: form.name,
        email: form.email,
        role: form.role,
        createdAt: new Date().toISOString(),
      });
      await signOut(secondaryAuth);
      setShowModal(false);
      setForm({ name: '', email: '', password: '', role: 'staff' });
      await load();
    } catch (err) {
      const msgs = {
        'auth/email-already-in-use': 'このメールアドレスは既に使用されています',
        'auth/weak-password': 'パスワードは6文字以上にしてください',
        'auth/invalid-email': 'メールアドレスの形式が正しくありません',
      };
      setError(msgs[err.code] ?? err.message);
    }
    setLoading(false);
  };

  const changeRole = async (id, role) => {
    await updateDoc(doc(db, 'users', id), { role });
    await load();
  };

  const deleteStaff = async (id) => {
    if (!window.confirm('このスタッフを削除しますか？')) return;
    await deleteDoc(doc(db, 'users', id));
    await load();
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-base">スタッフ管理</h2>
          <button
            onClick={() => { setShowModal(true); setError(''); }}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold active:bg-blue-700"
          >
            ＋ 追加
          </button>
        </div>

        <div className="space-y-2">
          {staffList.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{s.name}</div>
                  <div className="text-xs text-gray-400 truncate">{s.email}</div>
                  <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full ${
                    s.role === 'admin' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {s.role === 'admin' ? '管理者' : 'スタッフ'}
                  </span>
                </div>
                {s.id !== user.uid && (
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => changeRole(s.id, s.role === 'admin' ? 'staff' : 'admin')}
                      className="text-xs border border-gray-200 px-2 py-1 rounded-lg text-gray-600 whitespace-nowrap"
                    >
                      {s.role === 'admin' ? 'スタッフに変更' : '管理者に変更'}
                    </button>
                    <button
                      onClick={() => deleteStaff(s.id)}
                      className="text-xs border border-red-200 px-2 py-1 rounded-lg text-red-500 whitespace-nowrap"
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => signOut(auth)}
          className="mt-6 w-full py-3 border border-gray-200 rounded-xl text-gray-500 text-sm"
        >
          サインアウト
        </button>
      </div>

      {/* スタッフ追加モーダル */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white w-full rounded-t-2xl p-6">
            <h2 className="font-bold text-base mb-4">スタッフを追加</h2>

            {error && <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{error}</div>}

            <div className="space-y-3 mb-5">
              {[
                { label: '名前', key: 'name', type: 'text', placeholder: '山田 太郎' },
                { label: 'メールアドレス', key: 'email', type: 'email', placeholder: 'email@example.com' },
                { label: 'パスワード', key: 'password', type: 'password', placeholder: '6文字以上' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                  <input
                    type={type}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">権限</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none"
                >
                  <option value="staff">スタッフ</option>
                  <option value="admin">管理者</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold">
                キャンセル
              </button>
              <button onClick={addStaff} disabled={loading} className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50 active:bg-blue-700">
                {loading ? '追加中...' : '追加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
