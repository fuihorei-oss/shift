import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getMessaging, isSupported } from 'firebase/messaging';

// Firebase のウェブ設定はクライアントに配信される公開情報（apiKey 等は秘密ではない）。
// public/firebase-messaging-sw.js にも同じ値が直書きされている。
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
export const db = getFirestore(app);
export const auth = getAuth(app);

// messaging は Safari など非対応ブラウザがあるため isSupported で確認してから初期化
export const messagingPromise = isSupported().then(ok => ok ? getMessaging(app) : null);

// スタッフ追加時に現在のセッションを維持するためのサブアプリ
export function getSecondaryAuth() {
  const existing = getApps().find((a) => a.name === 'secondary');
  if (existing) return getAuth(existing);
  return getAuth(initializeApp(firebaseConfig, 'secondary'));
}
