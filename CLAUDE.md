# シフト管理アプリ — Claude 作業ルール

## 必須ルール

- **コードに変更を加えるたびに `package.json` のバージョンを上げること**
- デプロイは `npm run build && firebase deploy --only hosting --project shift-97e6f`
- Firestore ルール変更時は `firebase deploy --only firestore:rules --project shift-97e6f` も実行

## プロジェクト概要

- 本番 URL: https://shift-97e6f.web.app
- Firebase プロジェクト: shift-97e6f
- フレームワーク: Vite + React + Tailwind CSS
- データベース: Firestore
- 認証: Firebase Auth

## 主要ファイル

| ファイル | 役割 |
|---------|------|
| `src/App.jsx` | 認証・ルーティング・バージョンチェック |
| `src/firebase.js` | Firebase 初期化 |
| `src/components/Login.jsx` | ログイン・新規登録 |
| `src/components/AdminDashboard.jsx` | スタッフ管理・実績・インシデントメモ |
| `src/components/ScheduleGrid.jsx` | シフトグリッド・通知管理 |
| `src/components/AttendancePage.jsx` | 打刻（サーバータイムスタンプ） |
| `src/components/SubmissionPage.jsx` | シフト申請・通知バナー |
| `firestore.rules` | Firestore セキュリティルール |
| `public/version.json` | 自動更新チェック用（ビルド時に自動生成） |
