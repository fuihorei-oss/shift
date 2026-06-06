import { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email || !password) { setError('メールアドレスとパスワードを入力してください'); return; }
    if (mode === 'signup' && !name.trim()) { setError('名前を入力してください'); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          name: name.trim(),
          email,
          role: 'pending',
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      const msgs = {
        'auth/user-not-found': 'メールアドレスが見つかりません',
        'auth/wrong-password': 'パスワードが間違っています',
        'auth/invalid-credential': 'メールアドレスまたはパスワードが間違っています',
        'auth/email-already-in-use': 'このメールアドレスは既に登録されています',
        'auth/weak-password': 'パスワードは6文字以上にしてください',
        'auth/invalid-email': 'メールアドレスの形式が正しくありません',
      };
      setError(msgs[err.code] || 'エラーが発生しました');
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-8">シフト管理</h1>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex mb-6 bg-gray-100 rounded-xl p-1 gap-1">
            {['login', 'signup'].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
                }`}
              >
                {m === 'login' ? 'ログイン' : '新規登録'}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {mode === 'signup' && (
              <Field label="名前" type="text" value={name} onChange={setName} placeholder="山田 太郎" />
            )}
            <Field label="メールアドレス" type="email" value={email} onChange={setEmail} placeholder="email@example.com" />
            <Field label="パスワード" type="password" value={password} onChange={setPassword} placeholder="••••••" />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-5 w-full bg-blue-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50 active:bg-blue-700"
          >
            {loading ? '処理中...' : mode === 'login' ? 'ログイン' : '登録する'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, type, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}
