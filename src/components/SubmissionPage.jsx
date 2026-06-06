import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// 当月から4ヶ月先まで表示
function getAvailableMonths() {
  const t = new Date();
  const result = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(t.getFullYear(), t.getMonth() + i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

// 締め切り = 対象月の「前月5日」
function getDeadline5(ym) {
  const [y, m] = ym.split('-').map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, '0')}-05`;
}

// 休み希望変更期限 = 対象月の「前月15日」
function getDeadline15(ym) {
  const [y, m] = ym.split('-').map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, '0')}-15`;
}

export default function SubmissionPage() {
  const { user, userData } = useAuth();
  const [months] = useState(getAvailableMonths);
  const [ym, setYM] = useState(months[0]);
  const [sub, setSub] = useState(null);
  const [weeklyDays, setWeeklyDays] = useState(0);
  const [daysOff, setDaysOff] = useState({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const today = new Date().toLocaleDateString('sv-SE');
  const d5  = getDeadline5(ym);   // 前月5日
  const d15 = getDeadline15(ym);  // 前月15日
  const beforeD5  = today <= d5;
  const beforeD15 = today <= d15;
  const submitted  = !!sub?.submittedAt;
  // 5日まではweeklyDaysも変更可能（提出済みでも再提出できる）
  const canSubmit  = beforeD5;
  const canEditOff = submitted && beforeD15;

  useEffect(() => {
    getDoc(doc(db, 'submissions', `${user.uid}_${ym}`)).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setSub(d); setWeeklyDays(d.weeklyDays ?? 0); setDaysOff(d.daysOff ?? {});
      } else {
        setSub(null); setWeeklyDays(0); setDaysOff({});
      }
    });
  }, [user.uid, ym]);

  const flash = (text) => { setMsg(text); setTimeout(() => setMsg(''), 2500); };

  const submit = async () => {
    if (!weeklyDays) { flash('出勤日数を選択してください'); return; }
    setLoading(true);
    const data = { staffId: user.uid, staffName: userData?.name ?? '', yearMonth: ym, weeklyDays, daysOff, submittedAt: new Date().toISOString() };
    await setDoc(doc(db, 'submissions', `${user.uid}_${ym}`), data);
    setSub(data);
    flash('提出しました！');
    setLoading(false);
  };

  const saveDaysOff = async () => {
    await setDoc(doc(db, 'submissions', `${user.uid}_${ym}`), { daysOff }, { merge: true });
    flash('休み希望を保存しました！');
  };

  const toggleOff = (ds) => {
    if (!canSubmit && !canEditOff) return;
    setDaysOff(p => { const n = {...p}; n[ds]==='staff' ? delete n[ds] : (n[ds]='staff'); return n; });
  };

  const [y, mo] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const firstDay    = new Date(y, mo - 1, 1).getDay();

  const [badgeText, badgeClass] = (() => {
    if (!beforeD5 && !beforeD15) return ['確定済み（変更不可）', 'bg-gray-100 text-gray-500'];
    if (!beforeD5 && submitted)  return [`休み希望を変更できます（〜${d15}）`, 'bg-orange-50 text-orange-600'];
    if (!beforeD5)               return [`提出期限が過ぎています（${d5}まで）`, 'bg-red-50 text-red-600'];
    if (submitted)  return [`提出済み・変更可能（〜${d5}）`, 'bg-blue-50 text-blue-600'];
    return [`提出期限：${d5}`, 'bg-green-50 text-green-700'];
  })();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 月タブ（横スクロール） */}
      <div className="bg-white border-b border-gray-100 flex-shrink-0 overflow-x-auto">
        <div className="flex min-w-max">
          {months.map(m => {
            const dl = getDeadline5(m);
            const passed = new Date().toLocaleDateString('sv-SE') > dl;
            return (
              <button key={m} onClick={() => setYM(m)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap flex flex-col items-center ${ym===m ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'}`}>
                <span>{m.split('-')[0]}年{parseInt(m.split('-')[1])}月</span>
                <span className={`text-[9px] mt-0.5 ${passed ? 'text-red-400' : 'text-gray-300'}`}>
                  {passed ? '締切済' : `〜${dl}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ステータス */}
        <div className={`rounded-xl px-4 py-2.5 text-sm font-medium ${badgeClass}`}>{badgeText}</div>

        {/* 週の出勤日数 */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-sm font-bold mb-2">週の出勤日数</div>
          {!canSubmit && submitted ? (
            // 締め切り後は変更不可
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-blue-600">{weeklyDays}</span>
              <span className="text-gray-500 text-sm">日 / 週</span>
              <span className="text-xs text-gray-400 ml-1">（締め切り後・変更不可）</span>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-3">{d5} まで変更できます</p>
              <div className="flex gap-2 flex-wrap">
                {[1,2,3,4,5,6,7].map(n => (
                  <button key={n} onClick={() => canSubmit && setWeeklyDays(n)} disabled={!canSubmit}
                    className={`w-10 h-10 rounded-full text-sm font-bold border-2 transition-colors
                      ${weeklyDays===n ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-600'}
                      disabled:opacity-40`}>
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 休み希望カレンダー */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-sm font-bold mb-1">休み希望日</div>
          <p className="text-xs text-gray-400 mb-3">
            {canEditOff ? '15日まで変更できます' : canSubmit ? 'タップで選択' : '変更できません'}
          </p>
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((d,i) => (
              <div key={d} className={`text-center text-[10px] font-medium ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-400'}`}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
            {Array.from({length:daysInMonth}).map((_,idx)=>{
              const day = idx+1;
              const ds = `${ym}-${String(day).padStart(2,'0')}`;
              const isOff = daysOff[ds]==='staff';
              const dow = new Date(y,mo-1,day).getDay();
              return (
                <div key={day} onClick={()=>toggleOff(ds)}
                  className={`aspect-square flex items-center justify-center rounded text-xs font-medium
                    ${isOff ? 'bg-yellow-400 text-white' : dow===0 ? 'text-red-400' : dow===6 ? 'text-blue-400' : 'text-gray-700'}
                    ${(canSubmit||canEditOff)?'cursor-pointer active:opacity-60':''}`}>
                  {day}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-400">
            <div className="w-3 h-3 bg-yellow-400 rounded"/>休み希望
          </div>
        </div>

        {msg && <div className="bg-green-50 text-green-700 text-sm text-center py-2.5 rounded-xl font-medium">{msg}</div>}

        {canSubmit && (
          <button onClick={submit} disabled={loading||!weeklyDays}
            className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold text-base disabled:opacity-40">
            {loading ? '提出中...' : '提出する'}
          </button>
        )}
        {canEditOff && (
          <button onClick={saveDaysOff} className="w-full py-4 rounded-xl bg-orange-500 text-white font-bold text-base">
            休み希望を保存
          </button>
        )}
      </div>
    </div>
  );
}
