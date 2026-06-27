import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc, setDoc, getDoc, writeBatch, serverTimestamp, deleteField } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, auth, getSecondaryAuth } from '../firebase';
import { useAuth } from '../App';

const TABS = [
  {id:'staff',  label:'スタッフ'},
  {id:'stats',  label:'実績・メモ'},
  {id:'store',  label:'店舗設定'},
];

export default function AdminDashboard() {
  const [tab, setTab] = useState('staff');
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex border-b border-gray-100 bg-white flex-shrink-0">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${tab===t.id?'text-blue-600 border-b-2 border-blue-600':'text-gray-400'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab==='staff' && <StaffTab/>}
        {tab==='stats' && <StatsTab/>}
        {tab==='store' && <StoreTab/>}
      </div>
    </div>
  );
}

// ── スタッフ管理 ──────────────────────────────────────
function StaffTab() {
  const { user, userData } = useAuth();
  const isAdmin = userData?.role === 'admin';
  const [list, setList] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({name:'',email:'',password:'',role:'staff'});
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);

  const load = ()=>getDocs(collection(db,'users')).then(s=>setList(s.docs.map(d=>({id:d.id,...d.data()}))));
  useEffect(()=>{load();},[]);

  const add = async () => {
    if(!form.name||!form.email||!form.password){setError('全て入力してください');return;}
    setError(''); setLoading(true);
    try {
      const sa = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(sa,form.email,form.password);
      await setDoc(doc(db,'users',cred.user.uid),{name:form.name,email:form.email,role:form.role,createdAt:new Date().toISOString()});
      await signOut(sa);
      setModal(false); setForm({name:'',email:'',password:'',role:'staff'}); await load();
    } catch(e){
      const m={'auth/email-already-in-use':'このメールは既に使用されています（削除済みアカウントの場合はスタッフ本人がログインして再登録できます）','auth/weak-password':'6文字以上にしてください'};
      setError(m[e.code]??e.message);
    }
    setLoading(false);
  };

  const approve  = (id) => updateDoc(doc(db,'users',id),{role:'staff'}).then(load);
  const remove   = (id) => deleteDoc(doc(db,'users',id)).then(load);

  const pending  = list.filter(s=>s.role==='pending');
  const approved = list.filter(s=>s.role!=='pending' && s.role!=='suspended');

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-base">スタッフ管理</h2>
        <button onClick={()=>{setModal(true);setError('');}} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">＋ 追加</button>
      </div>

      {/* 承認待ち */}
      {pending.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-bold text-sm text-orange-600">承認待ち</h3>
            <span className="bg-orange-100 text-orange-600 text-xs px-2 py-0.5 rounded-full font-bold">{pending.length}人</span>
          </div>
          <div className="space-y-2">
            {pending.map(s=>(
              <div key={s.id} className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{s.name}</div>
                  <span className="mt-1 inline-block text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">承認待ち</span>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={()=>approve(s.id)}
                    className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap">
                    承認する
                  </button>
                  <button onClick={()=>window.confirm('削除しますか？')&&remove(s.id)}
                    className="text-xs border border-red-200 px-2 py-1 rounded-lg text-red-500 whitespace-nowrap">削除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 承認済みスタッフ */}
      <div className="space-y-2">
        {approved.map(s=>(
          <div key={s.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{s.name}</div>
              <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full ${s.role==='admin'?'bg-orange-100 text-orange-700':'bg-gray-100 text-gray-500'}`}>
                {s.role==='admin'?'管理者':'スタッフ'}
              </span>
            </div>
            {s.id!==useAuth().user.uid && (
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button onClick={()=>updateDoc(doc(db,'users',s.id),{role:s.role==='admin'?'staff':'admin'}).then(load)}
                  className="text-xs border border-gray-200 px-2 py-1 rounded-lg text-gray-600 whitespace-nowrap">
                  {s.role==='admin'?'スタッフに変更':'管理者に変更'}
                </button>
                <button onClick={()=>window.confirm('削除しますか？')&&remove(s.id)}
                  className="text-xs border border-red-200 px-2 py-1 rounded-lg text-red-500 whitespace-nowrap">削除</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <button onClick={()=>signOut(auth)} className="mt-6 w-full py-3 border border-gray-200 rounded-xl text-gray-500 text-sm">サインアウト</button>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="bg-white w-full rounded-t-2xl p-6">
            <h2 className="font-bold text-base mb-4">スタッフを追加</h2>
            {error && <div className="mb-3 p-3 bg-red-50 rounded-xl text-red-600 text-sm">{error}</div>}
            <div className="space-y-3 mb-5">
              {[['名前','name','text','山田 太郎'],['メールアドレス','email','email','email@example.com'],['パスワード','password','password','6文字以上']].map(([label,key,type,ph])=>(
                <div key={key}>
                  <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                  <input type={type} value={form[key]} placeholder={ph}
                    onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">権限</label>
                <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none">
                  <option value="staff">スタッフ</option>
                  <option value="admin">管理者</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setModal(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold">キャンセル</button>
              <button onClick={add} disabled={loading} className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
                {loading?'追加中...':'追加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 実績・メモ ──────────────────────────────────────────
function getRecentMonths() {
  const result = [];
  for (let i = -2; i <= 1; i++) {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() + i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  return result;
}

const toMin = (t) => { const [h,m]=(t??'00:00').split(':').map(Number); return h*60+m; };

// Firestore Timestamp・ISO文字列・null のいずれでも "HH:MM" に変換
const tsToTime = (ts) => {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
};

function resolveStatus(staffId, dateStr, submissions, overrides) {
  const ov = overrides[`${staffId}_${dateStr}`];
  if (ov) return ov;
  const sub = submissions[staffId];
  if (!sub) return 'none';
  if (sub.daysOff?.[dateStr] === 'staff') return 'staff_off';
  return 'available';
}

function StatsTab() {
  const [ym, setYM]           = useState(()=>new Date().toLocaleDateString('sv-SE').slice(0,7));
  const [months]               = useState(getRecentMonths);
  const [staffList,  setStaff] = useState([]);
  const [submissions,setSubs]  = useState({});
  const [overrides,  setOvrs]  = useState({});
  const [shiftStartTimes, setShiftStartTimes] = useState({}); // staffId_dateStr -> "HH:MM"
  const [shiftEndTimes,   setShiftEndTimes]   = useState({}); // staffId_dateStr -> "HH:MM"
  const [attMap,     setAtt]   = useState({});
  const [memos,      setMemos] = useState({});
  const [excusedMap, setExcusedMap] = useState({}); // staffId -> { dateStr -> true }
  const [manualIssuesMap, setManualIssuesMap] = useState({}); // { staffId: { ym: [{id,type,date,note}] } }
  const [dismissedMap, setDismissedMap] = useState({}); // { staffId: { 'YYYY-MM-DD_type': true } }
  const [addIssueTarget, setAddIssueTarget] = useState(null); // { staffId, type:'late'|'absent' }
  const [addIssueDate, setAddIssueDate] = useState('');
  const [addIssueNote, setAddIssueNote] = useState('');
  const [editIssueMemoTarget, setEditIssueMemoTarget] = useState(null); // { staffId, issueId }
  const [editIssueMemoText, setEditIssueMemoText] = useState('');
  const [memoTarget, setMemoTarget] = useState(null);
  const [memoText,   setMemoText]   = useState('');
  const [detailTarget, setDetailTarget] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [incidentMemos,      setIncidentMemos]      = useState({}); // { staffId: { dateStr: memo } }
  const [incidentMemoTarget, setIncidentMemoTarget] = useState(null); // { staffId, dateStr }
  const [incidentMemoText,   setIncidentMemoText]   = useState('');
  const [notifSent,          setNotifSent]          = useState(false);

  // 月が変わったら通知済みフラグをリセット
  useEffect(() => { setNotifSent(false); }, [ym]);

  useEffect(()=>{
    const load = async () => {
      setLoading(true);
      // submissions / attendance は当月分だけ取得（全件読み取りを回避）。
      // いずれも単一フィールド条件のみで複合インデックス不要。
      const monthStart = `${ym}-01`;
      const monthEnd = `${ym}-32`; // 'YYYY-MM-DD' の辞書順で当月末日まで含む上限
      const [uSnap,subSnap,ovSnap,attSnap,memoSnap] = await Promise.all([
        getDocs(collection(db,'users')),
        getDocs(query(collection(db,'submissions'), where('yearMonth','==',ym))),
        getDoc(doc(db,'adminOverrides',ym)),
        getDocs(query(collection(db,'attendance'), where('date','>=',monthStart), where('date','<',monthEnd))),
        getDocs(collection(db,'staffStats')),
      ]);
      setStaff(uSnap.docs.map(d=>({id:d.id,...d.data()})).filter(u => u.role === 'staff'));

      const subs={};
      subSnap.docs.forEach(d=>{ if(d.data().yearMonth===ym) subs[d.data().staffId]=d.data(); });
      setSubs(subs);

      const ovData = ovSnap.exists() ? ovSnap.data() : {};
      setOvrs(ovData.overrides ?? {});
      setShiftStartTimes(ovData.shiftStartTimes ?? {});
      setShiftEndTimes(ovData.shiftEndTimes ?? {});

      const att={};
      attSnap.docs.forEach(d=>{
        const r=d.data();
        if(r.date?.startsWith(ym)){
          if(!att[r.userId]) att[r.userId]={};
          att[r.userId][r.date]=r;
        }
      });
      setAtt(att);

      const mm={};
      const em={};
      const im={};
      const am={};
      memoSnap.docs.forEach(d=>{
        mm[d.id]=d.data().memo??'';
        em[d.id]=d.data().excusedDates??{};
        im[d.id]=d.data().incidentMemos??{};
        am[d.id]=d.data().manualIssues??{};
      });
      const dm={};
      memoSnap.docs.forEach(d=>{ dm[d.id]=d.data().dismissedIssues??{}; });
      setMemos(mm);
      setExcusedMap(em);
      setIncidentMemos(im);
      setManualIssuesMap(am);
      setDismissedMap(dm);
      setLoading(false);
    };
    load();
  },[ym]);

  // 確定シフト（●）のみ評価。遅刻はシフトごとの設定時刻が必須
  const getDayIssue = (staffId, dateStr) => {
    const today = new Date().toLocaleDateString('sv-SE');
    if (dateStr > today) return null;
    const status = resolveStatus(staffId, dateStr, submissions, overrides);
    if (status !== 'confirmed') return null;
    const rec = attMap[staffId]?.[dateStr];
    if (!rec?.clockInAt) return { type:'absent' };
    // 出勤時刻が設定されていない確定シフトは遅刻評価不可
    const shiftStartTime = shiftStartTimes[`${staffId}_${dateStr}`];
    if (!shiftStartTime) return null;
    const scheduledMin = toMin(shiftStartTime);
    const clockInStr   = tsToTime(rec.clockInAt);
    const clockInMin   = toMin(clockInStr);
    if (clockInMin > scheduledMin) {
      const shiftEndTime = shiftEndTimes[`${staffId}_${dateStr}`];
      return { type:'late', time:clockInStr, scheduledTime:shiftStartTime, endTime:shiftEndTime, lateMinutes:clockInMin-scheduledMin };
    }
    return null;
  };

  const getDatesInMonth = (ym) => {
    const [y,m] = ym.split('-').map(Number);
    return Array.from({length:new Date(y,m,0).getDate()},(_,i)=>
      `${ym}-${String(i+1).padStart(2,'0')}`
    );
  };

  const formatDate = (ds) => {
    const dow = ['日','月','火','水','木','金','土'][new Date(ds).getDay()];
    return `${parseInt(ds.split('-')[2])}日（${dow}）`;
  };

  const toggleExcuse = async (staffId, dateStr, excused) => {
    const curr = excusedMap[staffId] ?? {};
    const next = {...curr};
    if (excused) {
      next[dateStr] = true;
    } else {
      delete next[dateStr];
    }
    await setDoc(doc(db,'staffStats',staffId), {excusedDates:next}, {merge:true});
    setExcusedMap(p=>({...p,[staffId]:next}));
  };

  const saveMemo = async () => {
    if(!memoTarget) return;
    await setDoc(doc(db,'staffStats',memoTarget.id),{memo:memoText},{merge:true});
    setMemos(p=>({...p,[memoTarget.id]:memoText}));
    setMemoTarget(null);
  };

  const saveIncidentMemo = async () => {
    if(!incidentMemoTarget) return;
    const {staffId, dateStr} = incidentMemoTarget;
    const curr = incidentMemos[staffId] ?? {};
    const next = {...curr};
    if (incidentMemoText.trim()) {
      next[dateStr] = incidentMemoText.trim();
    } else {
      delete next[dateStr];
    }
    await setDoc(doc(db,'staffStats',staffId),{incidentMemos:next},{merge:true});
    setIncidentMemos(p=>({...p,[staffId]:next}));
    setIncidentMemoTarget(null);
  };

  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const saveManualIssue = async (staffId, type, date, note) => {
    const entry = { id: genId(), type, date, note: note.trim() };
    const curr = manualIssuesMap[staffId] ?? {};
    const next = { ...curr, [ym]: [...(curr[ym] ?? []), entry] };
    setManualIssuesMap(p => ({ ...p, [staffId]: next }));
    await setDoc(doc(db,'staffStats',staffId), { manualIssues: next }, {merge:true});
  };

  const deleteManualIssue = async (staffId, issueId) => {
    const curr = manualIssuesMap[staffId] ?? {};
    const next = { ...curr, [ym]: (curr[ym] ?? []).filter(e => e.id !== issueId) };
    setManualIssuesMap(p => ({ ...p, [staffId]: next }));
    await setDoc(doc(db,'staffStats',staffId), { manualIssues: next }, {merge:true});
  };

  const saveManualIssueMemo = async (staffId, issueId, note) => {
    const curr = manualIssuesMap[staffId] ?? {};
    const next = { ...curr, [ym]: (curr[ym] ?? []).map(e => e.id === issueId ? { ...e, note: note.trim() } : e) };
    setManualIssuesMap(p => ({ ...p, [staffId]: next }));
    await setDoc(doc(db,'staffStats',staffId), { manualIssues: next }, {merge:true});
  };

  const dismissIssue = async (staffId, dateStr, type) => {
    const curr = dismissedMap[staffId] ?? {};
    const next = { ...curr, [`${dateStr}_${type}`]: true };
    setDismissedMap(p => ({ ...p, [staffId]: next }));
    await setDoc(doc(db,'staffStats',staffId), { dismissedIssues: next }, {merge:true});
  };

  const dates = getDatesInMonth(ym);

  // 未提出者（pendingでもsuspendedでもないスタッフで、このymの提出がない人）
  const nonSubmitters = staffList.filter(
    s => s.role !== 'pending' && s.role !== 'suspended' && !submissions[s.id]
  );

  const sendNotifications = async () => {
    if (!window.confirm(`${nonSubmitters.length}名に提出リマインダーを送信しますか？`)) return;
    const [y, m] = ym.split('-');
    const msg = `${y}年${parseInt(m)}月分のシフト提出をお願いします。`;
    const batch = writeBatch(db);
    nonSubmitters.forEach(s => {
      batch.set(doc(db, 'notifications', s.id), {
        yearMonth: ym,
        message: msg,
        sentAt: serverTimestamp(),
      });
    });
    await batch.commit();
    setNotifSent(true);
  };

  const downloadCSV = () => {
    const [y, m] = ym.split('-');
    const dowLabels = ['日','月','火','水','木','金','土'];
    const activeStaff = staffList.filter(s => s.role !== 'pending' && s.role !== 'suspended');

    // ── 出勤記録シート ──
    const attHeader = ['スタッフ名','日付','曜日','出勤時刻','退勤時刻'];
    const attRows = [];
    activeStaff.forEach(s => {
      dates.forEach(ds => {
        const rec = (attMap[s.id] ?? {})[ds];
        if (!rec?.clockInAt) return;
        attRows.push([
          s.name, ds, dowLabels[new Date(ds).getDay()],
          tsToTime(rec.clockInAt) ?? '', tsToTime(rec.clockOutAt) ?? '',
        ]);
      });
    });

    // ── 月次サマリーシート ──
    const sumHeader = ['スタッフ名','出勤日数','遅刻回数','欠勤回数','週希望日数','開始時間'];
    const sumRows = activeStaff.map(s => {
      const issueEntries = dates.map(ds => ({ ds, issue: getDayIssue(s.id, ds) })).filter(x => x.issue);
      const excused   = excusedMap[s.id] ?? {};
      const csvDismissed = dismissedMap[s.id] ?? {};
      const csvManual    = manualIssuesMap[s.id]?.[ym] ?? [];
      const filteredEntries = issueEntries.filter(x => !csvDismissed[`${x.ds}_${x.issue.type}`]);
      return [
        s.name,
        Object.values(attMap[s.id] ?? {}).filter(r => r.clockInAt).length,
        filteredEntries.filter(x => x.issue.type === 'late').length + csvManual.filter(m => m.type === 'late').length,
        filteredEntries.filter(x => x.issue.type === 'absent' && !excused[x.ds]).length + csvManual.filter(m => m.type === 'absent').length,
        submissions[s.id]?.weeklyDays ?? '',
        submissions[s.id]?.startTime ?? '',
      ];
    });

    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const toCSV = (header, rows) =>
      [header, ...rows].map(r => r.map(esc).join(',')).join('\n');

    const content =
      `${y}年${parseInt(m)}月 出勤記録\n` +
      toCSV(attHeader, attRows) +
      '\n\n月次サマリー\n' +
      toCSV(sumHeader, sumRows);

    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `シフト管理_${y}年${parseInt(m)}月.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 月タブ */}
      <div className="bg-white border-b border-gray-100 flex overflow-x-auto flex-shrink-0">
        <div className="flex min-w-max">
          {months.map(m=>(
            <button key={m} onClick={()=>setYM(m)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${ym===m?'text-blue-600 border-b-2 border-blue-600':'text-gray-400'}`}>
              {m.split('-')[0]}年{parseInt(m.split('-')[1])}月
            </button>
          ))}
        </div>
      </div>

      {/* CSV ダウンロードバー */}
      <div className="bg-white border-b border-gray-50 px-4 py-2 flex justify-end flex-shrink-0">
        <button onClick={downloadCSV} disabled={loading}
          className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 active:bg-gray-200 disabled:opacity-40">
          ⬇ CSVで保存
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && <p className="text-center text-gray-400 text-sm py-8">読み込み中...</p>}

        {/* 未提出者通知バナー */}
        {!loading && nonSubmitters.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-sm text-orange-700 mb-1">
                  📋 未提出者 {nonSubmitters.length}名
                </div>
                <div className="text-xs text-gray-600 leading-relaxed">
                  {nonSubmitters.map(s => s.name).join('、')}
                </div>
              </div>
              <button
                onClick={sendNotifications}
                disabled={notifSent}
                className={`flex-shrink-0 text-xs px-3 py-2 rounded-lg font-semibold transition-colors ${
                  notifSent
                    ? 'bg-gray-100 text-gray-400 cursor-default'
                    : 'bg-orange-500 text-white active:opacity-80'
                }`}>
                {notifSent ? '通知済み ✓' : '通知を送る'}
              </button>
            </div>
          </div>
        )}
        {!loading && nonSubmitters.length === 0 && staffList.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-2">
            <span className="text-green-600 text-sm">✅ 全員提出済み</span>
          </div>
        )}

        {!loading && staffList.map(s=>{
          const dismissed     = dismissedMap[s.id] ?? {};
          const issues = dates
            .map(ds=>({ ds, issue: getDayIssue(s.id, ds) }))
            .filter(x => x.issue && !dismissed[`${x.ds}_${x.issue.type}`]);
          const excusedDates  = excusedMap[s.id] ?? {};
          const lateCount     = issues.filter(x=>x.issue.type==='late').length;
          const absentCount   = issues.filter(x=>x.issue.type==='absent' && !excusedDates[x.ds]).length;
          const excusedCount  = issues.filter(x=>x.issue.type==='absent' && excusedDates[x.ds]).length;
          const workDays      = Object.values(attMap[s.id]??{}).filter(r=>r.clockInAt).length;
          const manualItems   = manualIssuesMap[s.id]?.[ym] ?? [];
          const totalLate     = lateCount   + manualItems.filter(m => m.type === 'late').length;
          const totalAbsent   = absentCount + manualItems.filter(m => m.type === 'absent').length;

          return (
            <div key={s.id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <button
                    onClick={()=>setDetailTarget(s)}
                    className="font-bold text-sm text-blue-700 underline underline-offset-2 text-left active:opacity-60">
                    {s.name}
                  </button>
                  {memos[s.id] && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">📝 {memos[s.id]}</div>}
                </div>
                <button onClick={()=>{ setMemoTarget(s); setMemoText(memos[s.id]??''); }}
                  className="text-xs border border-gray-200 px-2 py-1 rounded-lg text-gray-500 flex-shrink-0 ml-2">
                  メモ
                </button>
              </div>

              {/* サマリー */}
              <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                <div className="bg-blue-50 rounded-lg py-1.5">
                  <div className="font-bold text-blue-600">{workDays}</div>
                  <div className="text-[10px] text-gray-500">出勤日数</div>
                </div>
                <div className="bg-orange-50 rounded-lg py-1.5">
                  <div className="font-bold text-orange-500">{totalLate}</div>
                  <div className="text-[10px] text-gray-500">遅刻</div>
                </div>
                <div className="bg-red-50 rounded-lg py-1.5">
                  <div className="font-bold text-red-500">{totalAbsent}</div>
                  <div className="text-[10px] text-gray-500">
                    欠勤{excusedCount>0&&<span className="text-gray-400 font-normal"> +{excusedCount}公</span>}
                  </div>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* ── 詳細モーダル ── */}
      {detailTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={e=>e.target===e.currentTarget&&setDetailTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl p-6 overflow-y-auto" style={{maxHeight:'85vh'}}>
            <h2 className="font-bold text-base">{detailTarget.name}</h2>
            <p className="text-xs text-gray-400 mb-5">
              {ym.split('-')[0]}年{parseInt(ym.split('-')[1])}月 — 勤怠詳細
            </p>

            {(()=>{
              const detailDismissed = dismissedMap[detailTarget.id] ?? {};
              const allIssues = dates
                .map(ds=>({ ds, issue: getDayIssue(detailTarget.id, ds) }))
                .filter(x => x.issue && !detailDismissed[`${x.ds}_${x.issue.type}`]);
              const lateItems   = allIssues.filter(x=>x.issue.type==='late');
              const absentItems = allIssues.filter(x=>x.issue.type==='absent');
              const excused     = excusedMap[detailTarget.id] ?? {};
              const manualDetItems    = manualIssuesMap[detailTarget.id]?.[ym] ?? [];
              const manualLateItems   = manualDetItems.filter(m => m.type === 'late');
              const manualAbsentItems = manualDetItems.filter(m => m.type === 'absent');
              const totalDetLate    = lateItems.length + manualLateItems.length;
              const totalDetAbsent  = absentItems.filter(x=>!excused[x.ds]).length + manualAbsentItems.length;

              return (
                <>
                  {/* 遅刻 */}
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-bold text-sm text-orange-600">遅刻</span>
                      <span className="bg-orange-100 text-orange-600 text-xs px-2 py-0.5 rounded-full font-bold">
                        {totalDetLate}件
                      </span>
                    </div>
                    {lateItems.length===0 ? (
                      <div className="text-xs text-gray-300 py-3 text-center bg-gray-50 rounded-xl">なし</div>
                    ) : (
                      <div className="space-y-2">
                        {lateItems.map(({ds, issue})=>(
                          <div key={ds} className="bg-orange-50 rounded-xl px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-semibold text-sm">{formatDate(ds)}</div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  勤務時間 {issue.scheduledTime}{issue.endTime ? ` 〜 ${issue.endTime}` : ''}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="text-right">
                                  <div className="text-orange-600 font-bold text-sm">{issue.time} 打刻</div>
                                  <div className="text-orange-500 text-xs font-semibold">{issue.lateMinutes}分遅刻</div>
                                </div>
                                <button onClick={()=>dismissIssue(detailTarget.id, ds, 'late')}
                                  className="text-red-400 text-sm w-6 h-6 flex items-center justify-center rounded-full border border-red-200 active:bg-red-50 flex-shrink-0">×</button>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              {incidentMemos[detailTarget.id]?.[ds]
                                ? <span className="text-xs text-gray-500 italic flex-1 truncate">📝 {incidentMemos[detailTarget.id][ds]}</span>
                                : <span className="flex-1"/>}
                              <button
                                onClick={()=>{setIncidentMemoTarget({staffId:detailTarget.id,dateStr:ds});setIncidentMemoText(incidentMemos[detailTarget.id]?.[ds]??'');}}
                                className="text-xs border border-gray-200 px-2 py-1 rounded-lg text-gray-500 flex-shrink-0 active:bg-gray-50">
                                {incidentMemos[detailTarget.id]?.[ds]?'メモ編集':'メモ追加'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {manualLateItems.map(m=>(
                      <div key={m.id} className="bg-orange-50 rounded-xl px-4 py-3 mt-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm">{m.date ? formatDate(m.date) : '日付未設定'}</div>
                            {m.note && <div className="text-xs text-gray-500 mt-0.5 truncate">📝 {m.note}</div>}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-xs text-orange-500 bg-orange-100 px-2 py-0.5 rounded-full">手動</span>
                            <button onClick={()=>{ setEditIssueMemoTarget({staffId:detailTarget.id,issueId:m.id}); setEditIssueMemoText(m.note??''); }}
                              className="text-xs border border-gray-200 px-2 py-1 rounded-lg text-gray-500 active:bg-gray-50">メモ</button>
                            <button onClick={()=>deleteManualIssue(detailTarget.id, m.id)}
                              className="text-red-400 text-sm w-6 h-6 flex items-center justify-center rounded-full border border-red-200 active:bg-red-50">×</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <button onClick={()=>{ setAddIssueTarget({staffId:detailTarget.id,type:'late'}); setAddIssueDate(''); setAddIssueNote(''); }}
                      className="w-full mt-2 py-2 rounded-xl border border-dashed border-orange-200 text-orange-500 text-xs font-semibold active:bg-orange-50">
                      ＋ 遅刻を追加
                    </button>
                  </div>

                  {/* 欠勤 */}
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-bold text-sm text-red-600">欠勤</span>
                      <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-bold">
                        {totalDetAbsent}件
                      </span>
                      {absentItems.some(x=>excused[x.ds]) && (
                        <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
                          公休 {absentItems.filter(x=>excused[x.ds]).length}件
                        </span>
                      )}
                    </div>
                    {absentItems.length===0 ? (
                      <div className="text-xs text-gray-300 py-3 text-center bg-gray-50 rounded-xl">なし</div>
                    ) : (
                      <div className="space-y-2">
                        {absentItems.map(({ds})=>{
                          const isExcused = !!excused[ds];
                          const st = shiftStartTimes[`${detailTarget.id}_${ds}`];
                          const et = shiftEndTimes[`${detailTarget.id}_${ds}`];
                          return (
                            <div key={ds} className={`rounded-xl px-4 py-3 ${isExcused?'bg-gray-50':'bg-red-50'}`}>
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="font-semibold text-sm">{formatDate(ds)}</div>
                                  {st && (
                                    <div className="text-xs text-gray-500 mt-0.5">
                                      勤務時間 {st}{et ? ` 〜 ${et}` : ''}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <button
                                    onClick={()=>toggleExcuse(detailTarget.id, ds, !isExcused)}
                                    className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
                                      isExcused
                                        ? 'bg-gray-200 text-gray-500 active:bg-gray-300'
                                        : 'bg-red-200 text-red-700 active:bg-red-300'
                                    }`}>
                                    {isExcused ? '公休（承認済）' : '欠勤'}
                                  </button>
                                  <button onClick={()=>dismissIssue(detailTarget.id, ds, 'absent')}
                                    className="text-red-400 text-sm w-6 h-6 flex items-center justify-center rounded-full border border-red-200 active:bg-red-50 flex-shrink-0">×</button>
                                </div>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                {incidentMemos[detailTarget.id]?.[ds]
                                  ? <span className="text-xs text-gray-500 italic flex-1 truncate">📝 {incidentMemos[detailTarget.id][ds]}</span>
                                  : <span className="flex-1"/>}
                                <button
                                  onClick={()=>{setIncidentMemoTarget({staffId:detailTarget.id,dateStr:ds});setIncidentMemoText(incidentMemos[detailTarget.id]?.[ds]??'');}}
                                  className="text-xs border border-gray-200 px-2 py-1 rounded-lg text-gray-500 flex-shrink-0 active:bg-gray-50">
                                  {incidentMemos[detailTarget.id]?.[ds]?'メモ編集':'メモ追加'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 mt-2 text-center">
                      タップして 欠勤 ↔ 公休（承認済）を切り替えます
                    </p>
                    {manualAbsentItems.map(m=>(
                      <div key={m.id} className="bg-red-50 rounded-xl px-4 py-3 mt-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm">{m.date ? formatDate(m.date) : '日付未設定'}</div>
                            {m.note && <div className="text-xs text-gray-500 mt-0.5 truncate">📝 {m.note}</div>}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-xs text-red-500 bg-red-100 px-2 py-0.5 rounded-full">手動</span>
                            <button onClick={()=>{ setEditIssueMemoTarget({staffId:detailTarget.id,issueId:m.id}); setEditIssueMemoText(m.note??''); }}
                              className="text-xs border border-gray-200 px-2 py-1 rounded-lg text-gray-500 active:bg-gray-50">メモ</button>
                            <button onClick={()=>deleteManualIssue(detailTarget.id, m.id)}
                              className="text-red-400 text-sm w-6 h-6 flex items-center justify-center rounded-full border border-red-200 active:bg-red-50">×</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <button onClick={()=>{ setAddIssueTarget({staffId:detailTarget.id,type:'absent'}); setAddIssueDate(''); setAddIssueNote(''); }}
                      className="w-full mt-2 py-2 rounded-xl border border-dashed border-red-200 text-red-500 text-xs font-semibold active:bg-red-50">
                      ＋ 欠勤を追加
                    </button>
                  </div>
                </>
              );
            })()}

            <button onClick={()=>setDetailTarget(null)}
              className="w-full py-3 rounded-xl border border-gray-200 text-gray-500 text-sm">
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 遅刻・欠勤 手動追加 */}
      {addIssueTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-[70]" onClick={e=>e.target===e.currentTarget&&setAddIssueTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl p-6">
            <h2 className="font-bold text-base mb-0.5">
              {addIssueTarget.type==='late' ? '遅刻を追加' : '欠勤を追加'}
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              {staffList.find(s=>s.id===addIssueTarget.staffId)?.name} — {ym.split('-')[0]}年{parseInt(ym.split('-')[1])}月
            </p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">日付（任意）</label>
                <input type="date" value={addIssueDate}
                  min={`${ym}-01`} max={`${ym}-31`}
                  onChange={e=>setAddIssueDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">メモ（任意）</label>
                <input type="text" value={addIssueNote}
                  onChange={e=>setAddIssueNote(e.target.value)}
                  placeholder="例: 電話連絡あり"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setAddIssueTarget(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold">キャンセル</button>
              <button
                onClick={()=>{ saveManualIssue(addIssueTarget.staffId, addIssueTarget.type, addIssueDate, addIssueNote); setAddIssueTarget(null); }}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold">
                追加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 手動追加エントリのメモ編集 */}
      {editIssueMemoTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-[70]" onClick={e=>e.target===e.currentTarget&&setEditIssueMemoTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl p-6">
            <h2 className="font-bold text-base mb-4">メモを編集</h2>
            <textarea value={editIssueMemoText} onChange={e=>setEditIssueMemoText(e.target.value)} rows={4}
              placeholder="例: 電話連絡あり、事前申告済み"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"/>
            <div className="flex gap-2">
              <button onClick={()=>setEditIssueMemoTarget(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold">キャンセル</button>
              <button onClick={()=>{ saveManualIssueMemo(editIssueMemoTarget.staffId, editIssueMemoTarget.issueId, editIssueMemoText); setEditIssueMemoTarget(null); }}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* インシデントメモ */}
      {incidentMemoTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-[60]" onClick={e=>e.target===e.currentTarget&&setIncidentMemoTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl p-6">
            <h2 className="font-bold text-base mb-0.5">
              {staffList.find(s=>s.id===incidentMemoTarget.staffId)?.name}
            </h2>
            <p className="text-xs text-gray-400 mb-4">{incidentMemoTarget.dateStr} のメモ</p>
            <textarea value={incidentMemoText} onChange={e=>setIncidentMemoText(e.target.value)} rows={4}
              placeholder="例: 電車遅延、事前連絡あり"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"/>
            <div className="flex gap-2">
              <button onClick={()=>setIncidentMemoTarget(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold">キャンセル</button>
              <button onClick={saveIncidentMemo} className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* メモ編集 */}
      {memoTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={e=>e.target===e.currentTarget&&setMemoTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl p-6">
            <h2 className="font-bold text-base mb-4">{memoTarget.name} — メモ</h2>
            <textarea value={memoText} onChange={e=>setMemoText(e.target.value)} rows={5}
              placeholder="スタッフに関するメモを入力..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"/>
            <div className="flex gap-2">
              <button onClick={()=>setMemoTarget(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold">キャンセル</button>
              <button onClick={saveMemo} className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 店舗設定 ───────────────────────────────────────────
function StoreTab() {
  // locations: [{ name, lat, lng, radius }] の配列。出勤はいずれかの地点の範囲内ならOK。
  const [locations, setLocations] = useState([]);
  const [saved, setSaved] = useState(true); const [loading, setLoading] = useState(false); const [msg, setMsg] = useState('');

  useEffect(()=>{
    getDoc(doc(db,'settings','store')).then(s=>{
      if(!s.exists()) return;
      const data = s.data();
      if(Array.isArray(data.locations)) {
        setLocations(data.locations);
      } else if (data.lat != null) {
        // 旧形式（単一店舗）を複数地点形式へ移行
        setLocations([{ name:'店舗', lat:data.lat, lng:data.lng, radius:data.radius??100 }]);
        setSaved(false);
      }
    });
  },[]);

  const addCurrentLocation = () => {
    setMsg(''); if(!navigator.geolocation){setMsg('GPSが利用できません');return;}
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos=>{
        setLocations(list=>[...list, { name:`出勤場所${list.length+1}`, lat:pos.coords.latitude, lng:pos.coords.longitude, radius:100 }]);
        setSaved(false); setLoading(false); setMsg('現在地を追加しました。保存してください。');
      },
      ()=>{ setMsg('位置情報の取得に失敗しました'); setLoading(false); },
      {enableHighAccuracy:true, timeout:10000}
    );
  };

  const updateLoc = (i, patch) => { setLocations(list=>list.map((l,idx)=>idx===i?{...l,...patch}:l)); setSaved(false); };
  const removeLoc = (i) => { setLocations(list=>list.filter((_,idx)=>idx!==i)); setSaved(false); };

  const save = async ()=>{
    // 複数地点形式で保存し、旧形式・WiFi の残骸フィールドを削除する
    await setDoc(doc(db,'settings','store'),
      { locations, lat:deleteField(), lng:deleteField(), radius:deleteField(), wifiIp:deleteField() },
      {merge:true});
    setSaved(true); setMsg('保存しました！');
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className="font-bold text-base mb-1">店舗設定</h2>
      <p className="text-xs text-gray-400 mb-5">登録した出勤場所のいずれかの範囲内にいる場合のみ出勤登録できます</p>

      {/* 出勤場所（複数登録可） */}
      <div className="space-y-4 mb-4">
        {locations.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-xs text-orange-400 text-center">
            出勤場所が未登録です。下のボタンで現在地を追加してください。
          </div>
        )}
        {locations.map((loc, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <input
                value={loc.name ?? ''}
                onChange={e=>updateLoc(i,{name:e.target.value})}
                placeholder="場所の名前（例: 本店）"
                className="text-sm font-medium text-gray-700 border-b border-gray-200 focus:border-blue-400 outline-none flex-1 mr-3 py-1"/>
              <button onClick={()=>removeLoc(i)}
                className="text-xs text-red-400 px-2 py-1.5 rounded-lg border border-red-200 active:bg-red-50 shrink-0">
                削除
              </button>
            </div>
            <div className="text-xs text-gray-500 mb-3 space-y-1">
              <div>緯度: {loc.lat?.toFixed(6)}</div>
              <div>経度: {loc.lng?.toFixed(6)}</div>
            </div>
            <div className="text-xs text-gray-400 mb-1">許容範囲（この距離 m 以内で打刻可能）</div>
            <div className="flex items-center gap-3">
              <input type="range" min="50" max="500" step="50" value={loc.radius??100}
                onChange={e=>updateLoc(i,{radius:Number(e.target.value)})} className="flex-1"/>
              <span className="text-sm font-bold w-16 text-right">{loc.radius??100} m</span>
            </div>
          </div>
        ))}
      </div>

      {/* 現在地を追加 */}
      <button onClick={addCurrentLocation} disabled={loading}
        className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50 mb-4">
        {loading?'取得中...':'📍 現在地を出勤場所として追加'}
      </button>

      {msg && <div className={`rounded-xl p-3 mb-4 text-sm text-center ${saved||msg.includes('追加')?'bg-green-50 text-green-700':'bg-red-50 text-red-600'}`}>{msg}</div>}
      <button onClick={save} className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold">保存</button>
    </div>
  );
}
