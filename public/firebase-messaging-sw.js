importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDuXtf1nawB_uQ23nH1h2JHTv1XvBhwtkY",
  authDomain: "shift-97e6f.firebaseapp.com",
  projectId: "shift-97e6f",
  storageBucket: "shift-97e6f.firebasestorage.app",
  messagingSenderId: "640293758559",
  appId: "1:640293758559:web:4145c5273d042494931dea"
});

const messaging = firebase.messaging();

// アプリがバックグラウンドのときに受信したメッセージを通知として表示
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  self.registration.showNotification(title ?? 'シフト管理', {
    body: body ?? '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  });
});
