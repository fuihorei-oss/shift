import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Firebase のウェブ設定はクライアントに配信される公開情報（apiKey 等は秘密ではない）。
// .env があればそちらを優先し、無い環境（CI など）ではこの既定値でビルドできる。
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDuXtf1nawB_uQ23nH1h2JHTv1XvBhwtkY',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'shift-97e6f.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'shift-97e6f',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'shift-97e6f.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '640293758559',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:640293758559:web:4145c5273d042494931dea',
};

export const app = initializeApp(firebaseConfig);

// オフライン永続キャッシュ（IndexedDB）を有効化。
// 再訪問時はコレクション全件を読み直さず、前回同期以降の差分だけサーバーから取得する
// （= 読み取り課金を大幅に削減）。環境によっては初期化に失敗しうるため、失敗時は
// 通常キャッシュへフォールバックし、アプリが起動不能（白画面）になるのを防ぐ。
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn('[firebase] 永続キャッシュの初期化に失敗。通常キャッシュで継続します:', e);
    return getFirestore(app);
  }
}
export const db = createDb();
export const auth = getAuth(app);

// スタッフ追加時に現在のセッションを維持するためのサブアプリ
export function getSecondaryAuth() {
  const existing = getApps().find((a) => a.name === 'secondary');
  if (existing) return getAuth(existing);
  return getAuth(initializeApp(firebaseConfig, 'secondary'));
}
