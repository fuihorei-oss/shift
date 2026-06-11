import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
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
                  {isAdmin && <div className="text-xs text-gray-400 truncate">{s.email}</div>}
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
              {isAdmin && <div className="text-xs text-gray-400 truncate">{s.email}</div>}
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
      const [uSnap,subSnap,ovSnap,attSnap,memoSnap] = await Promise.all([
        getDocs(collection(db,'users')),
        getDocs(collection(db,'submissions')),
        getDoc(doc(db,'adminOverrides',ym)),
        getDocs(collection(db,'attendance')),
        getDocs(collection(db,'staffStats')),
      ]);
      setStaff(uSnap.docs.map(d=>({id:d.id,...d.data()})));

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
      memoSnap.docs.forEach(d=>{
        mm[d.id]=d.data().memo??'';
        em[d.id]=d.data().excusedDates??{};
        im[d.id]=d.data().incidentMemos??{};
      });
      setMemos(mm);
      setExcusedMap(em);
      setIncidentMemos(im);
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
      const excused = excusedMap[s.id] ?? {};
      return [
        s.name,
        Object.values(attMap[s.id] ?? {}).filter(r => r.clockInAt).length,
        issueEntries.filter(x => x.issue.type === 'late').length,
        issueEntries.filter(x => x.issue.type === 'absent' && !excused[x.ds]).length,
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
          const issues = dates
            .map(ds=>({ ds, issue: getDayIssue(s.id, ds) }))
            .filter(x=>x.issue);
          const excusedDates  = excusedMap[s.id] ?? {};
          const lateCount     = issues.filter(x=>x.issue.type==='late').length;
          const absentCount   = issues.filter(x=>x.issue.type==='absent' && !excusedDates[x.ds]).length;
          const excusedCount  = issues.filter(x=>x.issue.type==='absent' && excusedDates[x.ds]).length;
          const workDays      = Object.values(attMap[s.id]??{}).filter(r=>r.clockInAt).length;

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
                  <div className="font-bold text-orange-500">{lateCount}</div>
                  <div className="text-[10px] text-gray-500">遅刻</div>
                </div>
                <div className="bg-red-50 rounded-lg py-1.5">
                  <div className="font-bold text-red-500">{absentCount}</div>
                  <div className="text-[10px] text-gray-500">
                    欠勤{excusedCount>0&&<span className="text-gray-400 font-normal"> +{excusedCount}公</span>}
                  </div>
                </div>
              </div>

              {/* 問題のある日 */}
              {issues.length > 0 ? (
                <div className="space-y-1">
                  {issues.map(({ds, issue})=>{
                    const isExcused = issue.type==='absent' && !!excusedDates[ds];
                    return (
                      <div key={ds} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs
                        ${issue.type==='late' ? 'bg-orange-50' : isExcused ? 'bg-gray-50' : 'bg-red-50'}`}>
                        <span className="text-gray-600 font-medium">{formatDate(ds)}</span>
                        {issue.type==='late'
                          ? <span className="text-orange-600 font-bold">{issue.lateMinutes}分遅刻（{issue.scheduledTime}→{issue.time}）</span>
                          : isExcused
                            ? <span className="text-gray-400 text-xs">公休</span>
                            : <span className="text-red-600 font-bold">欠勤</span>
                        }
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-gray-300 text-center py-1">確定シフトなし / 問題なし</div>
              )}
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
              const allIssues = dates
                .map(ds=>({ ds, issue: getDayIssue(detailTarget.id, ds) }))
                .filter(x=>x.issue);
              const lateItems   = allIssues.filter(x=>x.issue.type==='late');
              const absentItems = allIssues.filter(x=>x.issue.type==='absent');
              const excused     = excusedMap[detailTarget.id] ?? {};

              return (
                <>
                  {/* 遅刻 */}
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-bold text-sm text-orange-600">遅刻</span>
                      <span className="bg-orange-100 text-orange-600 text-xs px-2 py-0.5 rounded-full font-bold">
                        {lateItems.length}件
                      </span>
                    </div>
                    {lateItems.length===0 ? (
                      <div className="text-xs text-gray-300 py-3 text-center bg-gray-50 rounded-xl">なし</div>
                    ) : (
                      <div className="space-y-2">
                        {lateItems.map(({ds, issue})=>(
                          <div key={ds} className="bg-orange-50 rounded-xl px-4 py-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-sm">{formatDate(ds)}</div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  勤務時間 {issue.scheduledTime}{issue.endTime ? ` 〜 ${issue.endTime}` : ''}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-orange-600 font-bold text-sm">{issue.time} 打刻</div>
                                <div className="text-orange-500 text-xs font-semibold">{issue.lateMinutes}分遅刻</div>
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
                  </div>

                  {/* 欠勤 */}
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-bold text-sm text-red-600">欠勤</span>
                      <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-bold">
                        {absentItems.filter(x=>!excused[x.ds]).length}件
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
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-semibold text-sm">{formatDate(ds)}</div>
                                  {st && (
                                    <div className="text-xs text-gray-500 mt-0.5">
                                      勤務時間 {st}{et ? ` 〜 ${et}` : ''}
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={()=>toggleExcuse(detailTarget.id, ds, !isExcused)}
                                  className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
                                    isExcused
                                      ? 'bg-gray-200 text-gray-500 active:bg-gray-300'
                                      : 'bg-red-200 text-red-700 active:bg-red-300'
                                  }`}>
                                  {isExcused ? '公休（承認済）' : '欠勤'}
                                </button>
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
  const [store, setStore] = useState({lat:null,lng:null,radius:100,wifiIp:''});
  const [saved, setSaved] = useState(false); const [loading, setLoading] = useState(false); const [msg, setMsg] = useState('');
  useEffect(()=>{ getDoc(doc(db,'settings','store')).then(s=>{ if(s.exists()) setStore(s.data()); }); },[]);

  const setCurrentLocation = () => {
    setMsg(''); if(!navigator.geolocation){setMsg('GPSが利用できません');return;}
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos=>{ setStore(s=>({...s,lat:pos.coords.latitude,lng:pos.coords.longitude})); setSaved(false); setLoading(false); setMsg('現在地を取得しました。保存してください。'); },
      ()=>{ setMsg('位置情報の取得に失敗しました'); setLoading(false); }
    );
  };

  const detectWifiIp = async () => {
    setMsg(''); setLoading(true);
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const { ip } = await res.json();
      setStore(s=>({...s, wifiIp: ip}));
      setSaved(false);
      setMsg(`現在のIP（${ip}）を取得しました。保存してください。`);
    } catch {
      setMsg('IP取得に失敗しました。インターネット接続を確認してください。');
    }
    setLoading(false);
  };

  const save = async ()=>{ await setDoc(doc(db,'settings','store'),store,{merge:true}); setSaved(true); setMsg('保存しました！'); };

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className="font-bold text-base mb-1">店舗設定</h2>
      <p className="text-xs text-gray-400 mb-5">GPS・WiFi 両方を通過した場合のみ出勤登録可</p>

      {/* GPS 設定 */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <div className="text-sm font-medium text-gray-700 mb-1">📍 GPS 基準位置</div>
        <p className="text-xs text-gray-400 mb-3">店舗の緯度・経度を登録します</p>
        {store.lat
          ? <div className="text-xs text-gray-500 mb-3 space-y-1"><div>緯度: {store.lat?.toFixed(6)}</div><div>経度: {store.lng?.toFixed(6)}</div></div>
          : <div className="text-xs text-orange-400 mb-3">未設定</div>}
        <button onClick={setCurrentLocation} disabled={loading}
          className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
          {loading?'取得中...':'📍 現在地を店舗位置に設定'}
        </button>
      </div>

      {/* GPS 許容範囲 */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <div className="text-sm font-medium text-gray-700 mb-1">GPS 許容範囲</div>
        <p className="text-xs text-gray-400 mb-3">この距離（m）以内でのみ打刻可能</p>
        <div className="flex items-center gap-3">
          <input type="range" min="50" max="500" step="50" value={store.radius??100}
            onChange={e=>{setStore(s=>({...s,radius:Number(e.target.value)}));setSaved(false);}} className="flex-1"/>
          <span className="text-sm font-bold w-16 text-right">{store.radius??100} m</span>
        </div>
      </div>

      {/* WiFi IP 設定 */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <div className="text-sm font-medium text-gray-700 mb-1">📶 WiFi IP 制限</div>
        <p className="text-xs text-gray-400 mb-3">
          店舗のWiFiに接続した状態でボタンを押してIPを登録してください
        </p>
        {store.wifiIp ? (
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-mono text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg flex-1">{store.wifiIp}</span>
            <button
              onClick={()=>{setStore(s=>({...s,wifiIp:''}));setSaved(false);}}
              className="text-xs text-red-400 px-2 py-1.5 rounded-lg border border-red-200 active:bg-red-50">
              削除
            </button>
          </div>
        ) : (
          <div className="text-xs text-orange-400 mb-3">未設定</div>
        )}
        <button onClick={detectWifiIp} disabled={loading}
          className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50">
          {loading ? '取得中...' : '📶 現在のIPを店舗WiFiとして登録'}
        </button>
      </div>

      {msg && <div className={`rounded-xl p-3 mb-4 text-sm text-center ${saved||msg.includes('取得')?'bg-green-50 text-green-700':'bg-red-50 text-red-600'}`}>{msg}</div>}
      <button onClick={save} className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold">保存</button>
    </div>
  );
}
