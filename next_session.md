# 2026-06-07 作業まとめ

## 本番 URL
https://shift-97e6f.web.app

## 現在のバージョン
v1.3.0（package.json）

---

## 1. 削除済みアカウントの改善

### 1-1. エラーメッセージ表示（App.jsx / Login.jsx）
- 削除（suspended）されたユーザーがログインしようとすると
  「このアカウントは削除されています。管理者にお問い合わせください。」を表示
- 既にログイン中に削除された場合も同メッセージ＋即サインアウト

### 1-2. 削除 → 再登録フロー（AdminDashboard.jsx / App.jsx / Login.jsx）
- 削除処理を `role: 'suspended'` 変更から **Firestore ドキュメント完全削除** に変更
- 削除後に同じメール・パスワードでログイン or 新規登録 → 承認待ち状態で復帰
- 新規登録時に `updateProfile` で Firebase Auth に名前を保存 → 再ログイン時も名前が引き継がれる

---

## 2. バージョン表示修正（App.jsx）
- `text-[10px] text-gray-500` → `text-xs text-gray-400` に変更（視認性改善）

---

## 3. スタッフのサインアウト機能（App.jsx）
- ヘッダー右上の名前（▼）をタップ → ボトムシートが開く
  - 名前・メールアドレス・権限（スタッフ／管理者）を表示
  - 「サインアウト」ボタン
- スタッフ・管理者どちらからも利用可能
- **バグ修正**: `useState(showUserMenu)` を early return 後に置いていた → コンポーネント先頭に移動（React error #310 対応）

---

## 4. シフト表の改善（ScheduleGrid.jsx）

### 4-1. 未提出者の赤ハイライト
- 未提出スタッフの名前セルが赤背景・赤文字になる

### 4-2. 予定人数を確定（●）のみにカウント
- 以前は「○出勤可」も含めていたが、確定シフトだけを表示

### 4-3. 通知管理バー
- 未提出（未通知）の名前と「🔔 通知」ボタンを表示
- 通知済みはオレンジのバッジ（🔔 名前 ×）で表示
- × ボタンで通知を個別削除
- 名前セルに 🔔 アイコンで通知済みを識別

---

## 5. 遅刻・欠勤インシデントメモ（AdminDashboard.jsx）
- 実績タブ → 名前タップ → 詳細モーダルの各遅刻・欠勤行に「メモ追加」ボタン
- 入力したメモは 📝 で行内に表示、編集もできる
- `staffStats/{staffId}.incidentMemos = { dateStr: "memo text" }` に保存

---

## 6. スタッフへの通知機能（SubmissionPage.jsx）
- 管理者が「🔔 通知」を押す → Firestore `notifications/{staffId}` に書き込み
- スタッフがアプリを開くと「申請」タブにオレンジのバナーが表示
- シフト提出完了時に通知を自動クリア

---

## 7. プッシュ通知（v1.2.0）

### 仕組み
1. アプリ初回ログイン時に通知権限を要求
2. FCM トークンを `users/{uid}.fcmToken` に保存
3. 管理者が「🔔 通知」→ `notifications/{staffId}` に書き込み
4. Cloud Functions がトリガー → FCM 経由でデバイスにプッシュ送信

### 追加ファイル
| ファイル | 役割 |
|---------|------|
| `public/firebase-messaging-sw.js` | バックグラウンド通知受信 Service Worker |
| `functions/index.js` | Cloud Functions（Firestore トリガー → FCM 送信） |
| `functions/package.json` | Functions 依存関係 |

### ⚠️ プッシュ通知を有効にするには追加手順が必要

**Step 1 — VAPID キーを取得**
1. Firebase Console → プロジェクト設定 → Cloud Messaging
2. ウェブプッシュ証明書 → キーペアを生成
3. `.env` の `VITE_FIREBASE_VAPID_KEY=` に貼り付け

**Step 2 — Blaze プランに切り替え**（無料枠あり、実質 ¥0/月）
- Firebase Console → 左下「Spark」→「アップグレード」

**Step 3 — Functions をデプロイ**
```bash
firebase deploy --only functions --project shift-97e6f
```

**Step 4 — フロントをリビルド＆デプロイ**
```bash
npm run build && firebase deploy --only hosting --project shift-97e6f
```

> Cloud Functions なしでも「アプリ内通知（バナー）」は動作する。
> バックグラウンドへのプッシュ通知だけ Cloud Functions が必要。

---

## Firestore データ構造（追加分）

```
notifications/{staffId}
{
  staffId: "xxx",
  yearMonth: "2026-06",
  message: "2026年6月のシフトを提出してください",
  sentAt: ISO string
}

staffStats/{staffId}
{
  memo: "スタッフ全体メモ",
  excusedDates: { "2026-06-15": true },
  incidentMemos: { "2026-06-15": "電車遅延による遅刻" }
}

users/{uid}
{
  name, email, role,
  fcmToken: "FCM デバイストークン（プッシュ通知用）"
}
```

---

---

## 8. 管理者打刻登録・バージョン自動更新（v1.3.0）

### 8-1. 管理者による全スタッフ打刻管理（AttendancePage.jsx）
- 「現在出勤中のみ」→ 全承認済みスタッフ一覧に変更
- 各スタッフに出勤登録（緑）・退勤登録（赤）ボタンを表示
- 30秒自動更新 + 手動更新ボタン

### 8-2. ホーム画面追加時の自動更新（App.jsx / vite.config.js）
- デプロイ時に `public/version.json` を自動生成（`vite.config.js` プラグイン）
- アプリ起動時・フォアグラウンド復帰時にバージョンを照合
- 差異あり → 「新しいバージョンがあります」バナー + 「今すぐ更新」ボタン
- `firebase.json` で `version.json` を no-cache に設定

### 8-3. Firestore セキュリティ修正（firestore.rules）
- `attendance` update を管理者のみに制限（スタッフの打刻改ざん防止）
- `attendance` create を管理者も可能に（他スタッフの出勤登録のため）

---

## 残課題・既知の制限

- **GPS 偽装**: ブラウザ側のみの検証。開発者ツールで偽装可能（小規模店舗なら許容範囲）
- **Firebase App Check 未設定**: 設定すると不正アクセスをさらに防止できる
- **Firebase Auth アカウント残存**: アプリの「削除」は Firestore ドキュメントを削除するが Firebase Auth アカウントは残る。完全削除には Cloud Functions（Admin SDK）が必要
- **バンドルサイズ警告**: ビルド時に 685 kB の警告（動作に影響なし）
- **プッシュ通知**: VAPID キー設定・Blaze プランへの切り替えが未実施の場合はアプリ内通知のみ

---

## 主要ファイル一覧

| ファイル | 役割 |
|---------|------|
| `src/App.jsx` | 認証・ルーティング・プッシュ通知セットアップ |
| `src/firebase.js` | Firebase 初期化（messaging 含む） |
| `src/components/Login.jsx` | ログイン・新規登録・再登録フロー |
| `src/components/AdminDashboard.jsx` | スタッフ管理・実績・インシデントメモ |
| `src/components/ScheduleGrid.jsx` | シフトグリッド・通知管理 |
| `src/components/AttendancePage.jsx` | 打刻・管理者退勤操作 |
| `src/components/SubmissionPage.jsx` | シフト申請・通知バナー |
| `public/firebase-messaging-sw.js` | FCM バックグラウンド通知 SW |
| `functions/index.js` | Cloud Functions（プッシュ送信） |
| `firestore.rules` | Firestore セキュリティルール |
