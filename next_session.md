# 2026-06-06 作業まとめ

## 本番 URL
https://shift-97e6f.web.app

---

## 1. 遅刻・欠勤評価の改善（AdminDashboard.jsx）

### 変更内容
- 評価対象を「確定シフト（●）のみ」に絞った（以前は「出勤可」も評価対象だった）
- 遅刻は「何分遅刻か」を表示するよう改善（例: `28分遅刻（18:00→18:28）`）
- **名前をタップ**すると詳細モーダルが開く
  - 遅刻：日付・予定時刻・打刻時刻・遅刻分数
  - 欠勤：日付と「欠勤 ↔ 公休（承認済）」切り替えボタン
- 欠勤を公休に変更すると欠勤カウントから除外。`staffStats/{staffId}.excusedDates` に保存

---

## 2. シフト確定時の勤務時間設定（ScheduleGrid.jsx）

### 変更内容
- シフトグリッドのセルをタップして「出勤確定（●）」にする際、**開始時刻・終了時刻**を入力できるようにした
- 確定済みセルにはグリッド内に時刻を小さく表示（例: `●\n18:00\n〜22:00`）
- 時刻は `adminOverrides/{ym}` ドキュメントの `shiftStartTimes` / `shiftEndTimes` マップに保存
- **店舗設定の「標準出勤時刻」を廃止**。遅刻判定はシフトごとの設定時刻のみを使用（未設定の確定シフトは遅刻評価なし・欠勤は評価あり）

### Firestore データ構造（adminOverrides/{ym}）
```
{
  yearMonth: "2026-06",
  overrides: { "staffId_dateStr": "confirmed" | "available" | ... },
  shiftStartTimes: { "staffId_dateStr": "18:00" },
  shiftEndTimes:   { "staffId_dateStr": "22:00" }
}
```

---

## 3. セキュリティ修正

### 3-1. firestore.rules

| 修正内容 | 詳細 |
|----------|------|
| role の自己変更禁止 | スタッフが自分の `role` を `admin` に書き換える権限昇格を防止 |
| メールアドレス保護 | `users` の read を「自分自身か管理者のみ」に制限 |
| `isApproved()` 厳格化 | `role in ['staff', 'admin']` のみ許可（pending・suspended を完全ブロック） |

### 3-2. 承認フロー（Login.jsx / App.jsx / AdminDashboard.jsx）

- 新規登録 → `role: 'pending'` で作成 → 「承認待ち」画面を表示
- 管理者が「スタッフ管理」タブで承認（→ `role: 'staff'` に変更）
- 承認された瞬間にスタッフのアプリが自動で切り替わる（`onSnapshot` による即時反映）
- 管理者が直接追加したアカウントは引き続き即時有効

### 3-3. 削除→即ログイン不可（App.jsx / AdminDashboard.jsx）

- 「削除」ボタンは物理削除ではなく `role: 'suspended'` に変更
- `onSnapshot` でリアルタイム監視 → suspended になった瞬間に強制サインアウト
- 再ログイン時も `role: 'suspended'` を検出して即サインアウト → ログイン不可

### 3-4. 削除済みアカウントの自動復活防止（App.jsx）

- **問題**: コンソールからドキュメントを手動削除すると、スタッフがアプリを開いた際に新しいドキュメントが自動生成されて「復活」していた
- **修正**: アカウント作成から30秒以降でドキュメントが存在しない場合は「削除済み」と判断して即サインアウト（新規登録の30秒以内のみドキュメントを新規作成）
- **注意**: コンソールから手動削除する場合は Firebase Authentication からもアカウントを削除することを推奨。アプリの「削除」ボタン（suspended 処理）を使うのが確実

---

## 4. ヘッダーにバージョン表示（vite.config.js / App.jsx）

- `vite.config.js` で `__APP_VERSION__` を `package.json` の `version` から定義
- ヘッダーに `シフト管理  v1.0.0` と表示
- バージョンを上げるときは `package.json` の `"version"` を変更してビルド・デプロイするだけ

---

## 残課題・既知の制限

- **GPS 偽装**: 打刻の位置確認はブラウザ側の処理のみ。開発者ツールで偽装可能（小規模店舗なら許容範囲）
- **Firebase App Check 未設定**: Firebase Console の「App Check を構成する」通知が出ている。設定すると不正なアクセスをさらに防止できる
- **Firebase Auth アカウントの残存**: アプリの「削除」ボタンは `suspended` にするだけで Firebase Auth アカウントは残る。完全削除には Cloud Functions（Admin SDK）が必要
- **バンドルサイズ警告**: ビルド時に `631 kB` の警告が出るが動作に影響なし（必要に応じて dynamic import で分割可能）

---

## 主要ファイル一覧

| ファイル | 役割 |
|---------|------|
| `src/App.jsx` | 認証・ルーティング・承認待ち画面・onSnapshot 監視 |
| `src/components/Login.jsx` | ログイン・新規登録（pending で登録） |
| `src/components/AdminDashboard.jsx` | スタッフ管理・実績・店舗設定 |
| `src/components/ScheduleGrid.jsx` | シフトグリッド・確定時刻設定 |
| `src/components/AttendancePage.jsx` | 打刻・管理者退勤操作 |
| `src/components/SubmissionPage.jsx` | シフト申請 |
| `firestore.rules` | Firestore セキュリティルール |
| `vite.config.js` | ビルド設定・バージョン定数 |
