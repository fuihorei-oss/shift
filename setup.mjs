#!/usr/bin/env node
/**
 * Firebase 自動セットアップスクリプト
 * 実行: node setup.mjs
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

function run(cmd, silent = false) {
  return execSync(cmd, { stdio: silent ? 'pipe' : 'inherit', encoding: 'utf8' });
}

function tryRun(cmd) {
  try { return run(cmd, true); } catch { return null; }
}

function openBrowser(url) {
  try { run(`start "" "${url}"`, true); } catch {}
}

function printBox(text) {
  const line = '═'.repeat(text.length + 4);
  console.log(`\n╔${line}╗`);
  console.log(`║  ${text}  ║`);
  console.log(`╚${line}╝\n`);
}

async function main() {
  printBox('シフト管理 Firebase セットアップ');

  // ── Step 1: Firebase CLI ──────────────────────────────
  console.log('【1/7】Firebase CLI を確認中...');
  const ver = tryRun('firebase --version');
  if (!ver) {
    console.log('  Firebase CLI が見つかりません。インストールします...');
    run('npm install -g firebase-tools');
    console.log('  ✓ インストール完了');
  } else {
    console.log(`  ✓ Firebase CLI ${ver.trim()} 確認済み`);
  }

  // ── Step 2: ログイン ───────────────────────────────────
  console.log('\n【2/7】Firebase ログイン（ブラウザが開きます）...');
  run('firebase login --reauth');
  console.log('  ✓ ログイン完了');

  // ── Step 3: プロジェクト選択/作成 ─────────────────────
  console.log('\n【3/7】Firebase プロジェクト設定');
  const mode = await ask('  新しいプロジェクトを作成しますか？ [y/n]: ');
  let projectId;

  if (mode.trim().toLowerCase() === 'y') {
    projectId = (await ask('  プロジェクトID（英数字・ハイフン、例: shift-mgmt-2024）: ')).trim();
    console.log('  プロジェクトを作成中...');
    try {
      run(`firebase projects:create ${projectId} --display-name "シフト管理"`);
      console.log('  ✓ プロジェクト作成完了');
    } catch {
      console.log('  ⚠ 作成失敗。IDが使用済みの場合は既存プロジェクトを選択してください。');
      projectId = (await ask('  プロジェクトID: ')).trim();
    }
  } else {
    const list = tryRun('firebase projects:list');
    console.log('\n  利用可能なプロジェクト:');
    console.log(list);
    projectId = (await ask('  プロジェクトIDを入力: ')).trim();
  }

  // ── Step 4: Web アプリ作成 & 設定取得 ─────────────────
  console.log('\n【4/7】Web アプリの作成と設定取得...');
  let sdkConfig = null;

  try {
    // Web アプリを作成
    const createOut = run(`firebase apps:create WEB "シフト管理" --project ${projectId}`, true);
    const appIdMatch = createOut.match(/App ID:\s+(\S+)/);
    const appId = appIdMatch?.[1];
    console.log(`  ✓ Web アプリ作成完了 (ID: ${appId})`);

    // SDK 設定を JSON で取得
    if (appId) {
      const sdkRaw = run(`firebase apps:sdkconfig WEB ${appId} --project ${projectId}`, true);
      const jsonStr = sdkRaw.match(/\{[\s\S]*\}/)?.[0];
      if (jsonStr) sdkConfig = JSON.parse(jsonStr);
    }
  } catch {
    // 既存アプリから取得を試みる
    console.log('  アプリを新規作成できません。既存アプリから設定を取得します...');
    try {
      const listOut = run(`firebase apps:list WEB --project ${projectId}`, true);
      const appIdMatch = listOut.match(/1:[0-9]+:web:[a-z0-9]+/);
      if (appIdMatch) {
        const sdkRaw = run(`firebase apps:sdkconfig WEB ${appIdMatch[0]} --project ${projectId}`, true);
        const jsonStr = sdkRaw.match(/\{[\s\S]*\}/)?.[0];
        if (jsonStr) sdkConfig = JSON.parse(jsonStr);
        console.log('  ✓ 設定取得完了');
      }
    } catch {}
  }

  // 自動取得失敗時の手動入力
  if (!sdkConfig) {
    const consoleUrl = `https://console.firebase.google.com/project/${projectId}/settings/general`;
    console.log('\n  ⚠ 設定の自動取得に失敗しました。');
    console.log('  以下のURLを開いて「マイアプリ」から設定をコピーしてください:');
    console.log(`  ${consoleUrl}`);
    openBrowser(consoleUrl);
    const raw = await ask('\n  設定オブジェクト ({...} の部分) を貼り付けてください:\n  > ');
    try { sdkConfig = JSON.parse(raw.trim()); } catch {
      console.error('  JSON解析に失敗しました。セットアップを中断します。');
      rl.close();
      process.exit(1);
    }
  }

  // ── Step 5: .env ファイル作成 ─────────────────────────
  console.log('\n【5/7】.env ファイルを作成中...');
  const envContent = [
    `VITE_FIREBASE_API_KEY=${sdkConfig.apiKey}`,
    `VITE_FIREBASE_AUTH_DOMAIN=${sdkConfig.authDomain}`,
    `VITE_FIREBASE_PROJECT_ID=${sdkConfig.projectId}`,
    `VITE_FIREBASE_STORAGE_BUCKET=${sdkConfig.storageBucket ?? ''}`,
    `VITE_FIREBASE_MESSAGING_SENDER_ID=${sdkConfig.messagingSenderId}`,
    `VITE_FIREBASE_APP_ID=${sdkConfig.appId}`,
  ].join('\n') + '\n';

  writeFileSync('.env', envContent);
  console.log('  ✓ .env 作成完了');

  // ── Step 6: Firestore ルールデプロイ ─────────────────
  console.log('\n【6/7】Firestore ルールをデプロイ中...');

  // firebase.json がなければ作成
  if (!existsSync('firebase.json')) {
    writeFileSync('firebase.json', JSON.stringify({
      firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' }
    }, null, 2));
  }
  if (!existsSync('firestore.indexes.json')) {
    writeFileSync('firestore.indexes.json', JSON.stringify({ indexes: [], fieldOverrides: [] }, null, 2));
  }

  try {
    // まず Firestore が存在するか確認のため、データベースを作成
    tryRun(`firebase firestore:databases:create --project ${projectId} --location asia-northeast1`);
  } catch {}

  const deployResult = tryRun(`firebase deploy --only firestore:rules --project ${projectId}`);
  if (deployResult) {
    console.log('  ✓ Firestore ルールデプロイ完了');
  } else {
    console.log('  ⚠ ルールのデプロイに失敗しました（Firestoreがまだ作成されていない可能性があります）');
    console.log('  後で手動で実行: firebase deploy --only firestore:rules');
  }

  // ── Step 7: Email/Password 認証の有効化 ───────────────
  const authUrl = `https://console.firebase.google.com/project/${projectId}/authentication/providers`;
  console.log('\n【7/7】メール/パスワード認証を有効化...');
  console.log('\n  ┌─────────────────────────────────────────────┐');
  console.log('  │  ブラウザが開きます。以下の操作をしてください:  │');
  console.log('  │                                             │');
  console.log('  │  1. 「メール / パスワード」をクリック         │');
  console.log('  │  2. 「有効にする」をON                       │');
  console.log('  │  3. 「保存」をクリック                       │');
  console.log('  └─────────────────────────────────────────────┘');
  openBrowser(authUrl);

  await ask('\n  認証を有効化したら Enter を押してください...');

  // ── 完了 ─────────────────────────────────────────────
  printBox('セットアップ完了！');

  console.log('  ▶ アプリを起動するには:\n');
  console.log('      npm run dev\n');
  console.log('  ▶ 最初に新規登録でアカウントを作成し、');
  console.log('    Firebase Console の Firestore で自分の');
  console.log('    users ドキュメントの role を "admin" に変更してください:\n');
  console.log(`      https://console.firebase.google.com/project/${projectId}/firestore\n`);

  rl.close();
}

main().catch((err) => {
  console.error('\nエラー:', err.message);
  rl.close();
  process.exit(1);
});
