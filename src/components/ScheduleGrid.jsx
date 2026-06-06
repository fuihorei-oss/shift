import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

function getAvailableMonths() {
  const t = new Date();
  const result = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(t.getFullYear(), t.getMonth() + i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

const CELL = {
  available:  { text:'○',    bg:'bg-white',       tc:'text-gray-700',   border:'' },
  staff_off:  { text:'希望休', bg:'bg-yellow-50',  tc:'text-yellow-700', border:'' },
  admin_off:  { text:'管理休', bg:'bg-red-50',     tc:'text-red-600',    border:'' },
  confirmed:  { text:'●',    bg:'bg-blue-50',     tc:'text-blue-700',   border:'' },
  none:       { text:'',      bg:'bg-gray-50',     tc:'text-gray-300',   border:'' },
};

export default function ScheduleGrid() {
  const [months]  = useState(getAvailableMonths);
  const [ym, setYM] = useState(months[0]);
  const [staffList,       setStaffList]       = useState([]);
  const [submissions,     setSubmissions]     = useState({});
  const [overrides,       setOverrides]       = useState({});
  const [shiftStartTimes, setShiftStartTimes] = useState({}); // staffId_dateStr -> "HH:MM"
  const [shiftEndTimes,   setShiftEndTimes]   = useState({}); // staffId_dateStr -> "HH:MM"
  const [clockedMap,      setClockedMap]      = useState({});
  const [cellModal,    setCellModal]    = useState(null);
  const [modalStartTime, setModalStartTime] = useState('18:00');
  const [modalEndTime,   setModalEndTime]   = useState('22:00');
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [sentNotifications, setSentNotifications] = useState({}); // { staffId: notifData }

  useEffect(() => {
    getDocs(collection(db,'users')).then(snap =>
      setStaffList(snap.docs.map(d=>({id:d.id,...d.data()})))
    );
  }, []);

  useEffect(() => {
    const load = async () => {
      const [subSnap, ovSnap, attSnap, notifSnap] = await Promise.all([
        getDocs(collection(db,'submissions')),
        getDoc(doc(db,'adminOverrides',ym)),
        getDocs(collection(db,'attendance')),
        getDocs(collection(db,'notifications')),
      ]);
      const subs = {};
      subSnap.docs.forEach(d => { if(d.data().yearMonth===ym) subs[d.data().staffId]=d.data(); });
      setSubmissions(subs);

      const ovData = ovSnap.exists() ? ovSnap.data() : {};
      setOverrides(ovData.overrides ?? {});
      setShiftStartTimes(ovData.shiftStartTimes ?? {});
      setShiftEndTimes(ovData.shiftEndTimes ?? {});

      const notifs = {};
      notifSnap.docs.forEach(d => {
        if (d.data().yearMonth === ym) notifs[d.id] = d.data();
      });
      setSentNotifications(notifs);

      const cmap = {};
      attSnap.docs.forEach(d => {
        const r = d.data();
        if (r.date?.startsWith(ym) && r.clockIn) {
          cmap[r.date] = (cmap[r.date] ?? 0) + 1;
        }
      });
      setClockedMap(cmap);
    };
    load();
  }, [ym]);

  const [y, mo] = ym.split('-').map(Number);
  const days = Array.from({length: new Date(y,mo,0).getDate()}, (_,i)=>i+1);

  const getCellStatus = (staffId, day) => {
    const ds = `${ym}-${String(day).padStart(2,'0')}`;
    const ov = overrides[`${staffId}_${ds}`];
    if (ov) return ov;
    const sub = submissions[staffId];
    if (!sub) return 'none';
    if (sub.daysOff?.[ds]==='staff') return 'staff_off';
    return 'available';
  };

  const openModal = (staff, day) => {
    const ds = `${ym}-${String(day).padStart(2,'0')}`;
    const status = getCellStatus(staff.id, day);
    const key = `${staff.id}_${ds}`;
    setCellModal({staffId:staff.id, staffName:staff.name, dateStr:ds, status});
    setModalStartTime(shiftStartTimes[key] ?? '18:00');
    setModalEndTime(shiftEndTimes[key] ?? '22:00');
  };

  const saveOverride = async (staffId, dateStr, newStatus) => {
    setSaving(true);
    const key = `${staffId}_${dateStr}`;
    const nextOvr    = {...overrides};
    const nextStarts = {...shiftStartTimes};
    const nextEnds   = {...shiftEndTimes};

    if (newStatus === 'clear') {
      delete nextOvr[key];
      delete nextStarts[key];
      delete nextEnds[key];
    } else {
      nextOvr[key] = newStatus;
      if (newStatus === 'confirmed') {
        nextStarts[key] = modalStartTime;
        nextEnds[key]   = modalEndTime;
      } else {
        delete nextStarts[key];
        delete nextEnds[key];
      }
    }

    await setDoc(doc(db,'adminOverrides',ym), {
      yearMonth: ym,
      overrides: nextOvr,
      shiftStartTimes: nextStarts,
      shiftEndTimes: nextEnds,
    });
    setOverrides(nextOvr);
    setShiftStartTimes(nextStarts);
    setShiftEndTimes(nextEnds);
    setCellModal(null);
    setSaving(false);
  };

  // 予定人数は「確定（●）」のみカウント
  const dayCount = (day) =>
    staffList.filter(s => getCellStatus(s.id, day) === 'confirmed').length;

  const unsubmitted = staffList.filter(s => !submissions[s.id]);
  const notNotified = unsubmitted.filter(s => !sentNotifications[s.id]);

  const notifyUnsubmitted = async () => {
    if (notNotified.length === 0) return;
    if (!window.confirm(`未通知の${notNotified.length}名に通知を送りますか？`)) return;
    setNotifying(true);
    const batch = writeBatch(db);
    const [y, m] = ym.split('-');
    const msg = `${y}年${parseInt(m)}月のシフトを提出してください`;
    const now = new Date().toISOString();
    notNotified.forEach(s => {
      batch.set(doc(db, 'notifications', s.id), {
        staffId: s.id, yearMonth: ym, message: msg, sentAt: now,
      });
    });
    await batch.commit();
    const newNotifs = {...sentNotifications};
    notNotified.forEach(s => { newNotifs[s.id] = { staffId: s.id, yearMonth: ym, message: msg, sentAt: now }; });
    setSentNotifications(newNotifs);
    setNotifying(false);
  };

  const deleteNotification = async (staffId) => {
    await deleteDoc(doc(db, 'notifications', staffId));
    setSentNotifications(p => { const n = {...p}; delete n[staffId]; return n; });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 月タブ */}
      <div className="bg-white border-b border-gray-100 flex-shrink-0 overflow-x-auto">
        <div className="flex min-w-max">
          {months.map(m=>(
            <button key={m} onClick={()=>setYM(m)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap ${ym===m?'text-blue-600 border-b-2 border-blue-600':'text-gray-400'}`}>
              {m.split('-')[0]}年{parseInt(m.split('-')[1])}月
            </button>
          ))}
        </div>
      </div>

      {/* 通知管理バー */}
      {(notNotified.length > 0 || Object.keys(sentNotifications).length > 0) && (
        <div className="bg-red-50 border-b border-red-100 px-3 py-2 flex-shrink-0 space-y-1.5">
          {/* 未通知の未提出者 */}
          {notNotified.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-600 font-medium">
                未提出（未通知）: {notNotified.map(s=>s.name).join('・')}
              </span>
              <button onClick={notifyUnsubmitted} disabled={notifying}
                className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-semibold flex-shrink-0 ml-2 disabled:opacity-50 active:opacity-70">
                {notifying ? '送信中...' : '🔔 通知'}
              </button>
            </div>
          )}
          {/* 通知済みバッジ（×で削除） */}
          {Object.keys(sentNotifications).length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] text-orange-500 font-semibold">通知済み:</span>
              {Object.entries(sentNotifications).map(([sid, n]) => {
                const s = staffList.find(x=>x.id===sid);
                if (!s) return null;
                return (
                  <span key={sid} className="flex items-center gap-1 bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 text-[11px]">
                    🔔 {s.name}
                    <button onClick={()=>deleteNotification(sid)}
                      className="text-orange-400 font-bold text-xs leading-none active:text-orange-700 ml-0.5">×</button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* グリッド */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 bg-gray-100 border border-gray-300 px-2 py-1.5 text-left min-w-[60px] whitespace-nowrap">名前</th>
              {days.map(day=>{
                const dow = new Date(y,mo-1,day).getDay();
                return (
                  <th key={day} className={`border border-gray-300 text-center min-w-[36px] py-1
                    ${dow===0?'bg-red-50 text-red-500':dow===6?'bg-blue-50 text-blue-500':'bg-gray-100 text-gray-600'}`}>
                    <div className="font-bold">{day}</div>
                    <div className="text-[9px] font-normal">{['日','月','火','水','木','金','土'][dow]}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {staffList.map(staff=>(
              <tr key={staff.id}>
                <td className={`sticky left-0 z-10 border border-gray-300 px-2 py-1 font-medium whitespace-nowrap
                  ${!submissions[staff.id] ? 'bg-red-50 text-red-600' : 'bg-white text-gray-700'}`}>
                  {staff.name}
                  {!submissions[staff.id] && <span className="ml-1 text-[9px]">未提出</span>}
                  {sentNotifications[staff.id] && <span className="ml-0.5 text-[10px]">🔔</span>}
                </td>
                {days.map(day=>{
                  const status = getCellStatus(staff.id, day);
                  const c = CELL[status] ?? CELL.none;
                  const dow = new Date(y,mo-1,day).getDay();
                  const ds = `${ym}-${String(day).padStart(2,'0')}`;
                  const key = `${staff.id}_${ds}`;
                  const startT = status === 'confirmed' ? shiftStartTimes[key] : null;
                  const endT   = status === 'confirmed' ? shiftEndTimes[key]   : null;
                  return (
                    <td key={day}
                      onClick={() => openModal(staff, day)}
                      className={`border border-gray-200 text-center cursor-pointer active:opacity-60
                        ${dow===0?'bg-red-50':dow===6?'bg-blue-50':c.bg}`}>
                      {startT ? (
                        <div className="flex flex-col items-center py-0.5 leading-none">
                          <span className="text-[10px] font-bold text-blue-700">●</span>
                          <span className="text-[8px] text-blue-600 font-medium">{startT}</span>
                          {endT && <span className="text-[7px] text-blue-400">〜{endT}</span>}
                        </div>
                      ) : (
                        <span className={`text-[11px] font-medium ${c.tc}`}>{c.text}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* 合計行（出勤予定） */}
            <tr>
              <td className="sticky left-0 z-10 bg-gray-100 border border-gray-300 px-2 py-1 font-bold text-gray-600 text-center whitespace-nowrap text-[10px]">予定</td>
              {days.map(day=>(
                <td key={day} className="border border-gray-200 bg-gray-50 text-center">
                  <span className="text-[11px] font-bold text-gray-700">{dayCount(day)||''}</span>
                </td>
              ))}
            </tr>
            {/* 打刻済み行 */}
            <tr>
              <td className="sticky left-0 z-10 bg-blue-50 border border-gray-300 px-2 py-1 font-bold text-blue-600 text-center whitespace-nowrap text-[10px]">打刻</td>
              {days.map(day=>{
                const ds = `${ym}-${String(day).padStart(2,'0')}`;
                const cnt = clockedMap[ds] ?? 0;
                return (
                  <td key={day} className="border border-gray-200 bg-blue-50 text-center">
                    <span className={`text-[11px] font-bold ${cnt > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                      {cnt || ''}
                    </span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* 凡例 */}
      <div className="bg-white border-t border-gray-100 px-3 py-2 flex gap-3 flex-shrink-0 flex-wrap">
        {[['○','bg-white border border-gray-300','出勤可'],['希','bg-yellow-50','希望休'],['休','bg-red-50','管理休'],['●','bg-blue-50','確定']].map(([t,bg,label])=>(
          <div key={label} className="flex items-center gap-1 text-xs text-gray-500">
            <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${bg}`}>{t}</div>
            {label}
          </div>
        ))}
      </div>

      {/* セル編集モーダル */}
      {cellModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={e=>e.target===e.currentTarget&&setCellModal(null)}>
          <div className="bg-white w-full rounded-t-2xl p-5">
            <h2 className="font-bold text-base">{cellModal.staffName}</h2>
            <p className="text-gray-400 text-xs mb-4">{cellModal.dateStr}</p>

            {/* 勤務時間（出勤確定時に使用） */}
            <div className="mb-4 bg-blue-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">勤務時間（「出勤確定」に適用）</p>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <p className="text-[10px] text-blue-500 mb-1 text-center">開始</p>
                  <input type="time" value={modalStartTime} onChange={e=>setModalStartTime(e.target.value)}
                    className="w-full border border-blue-200 rounded-lg px-2 py-2 text-center text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
                <span className="text-blue-500 font-bold text-lg mt-4">〜</span>
                <div className="flex-1">
                  <p className="text-[10px] text-blue-500 mb-1 text-center">終了</p>
                  <input type="time" value={modalEndTime} onChange={e=>setModalEndTime(e.target.value)}
                    className="w-full border border-blue-200 rounded-lg px-2 py-2 text-center text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
              </div>
              <p className="text-[10px] text-blue-400 mt-2 text-center">開始時刻を基準に遅刻を判定します</p>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                {val:'available', label:'○ 出勤可',  cls:'border-green-300 text-green-700'},
                {val:'staff_off', label:'希望休',     cls:'border-yellow-300 text-yellow-700'},
                {val:'admin_off', label:'管理者休み', cls:'border-red-300 text-red-600'},
                {val:'confirmed', label:'● 出勤確定', cls:'border-blue-300 text-blue-700'},
                {val:'clear',     label:'クリア',     cls:'border-gray-200 text-gray-500'},
              ].map(opt=>(
                <button key={opt.val} onClick={()=>saveOverride(cellModal.staffId,cellModal.dateStr,opt.val)}
                  disabled={saving}
                  className={`py-3 rounded-xl border-2 font-semibold text-sm disabled:opacity-50 active:opacity-70 ${opt.cls}
                    ${cellModal.status===opt.val?'ring-2 ring-offset-1 ring-current':''}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <button onClick={()=>setCellModal(null)} className="w-full py-3 rounded-xl border border-gray-200 text-gray-500 text-sm">閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
