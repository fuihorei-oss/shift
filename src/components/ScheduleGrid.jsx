import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, setDoc, getDoc, deleteDoc, writeBatch } from 'firebase/firestore';
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
  available:  { text:'○',    bg:'bg-white',       tc:'text-gray-700' },
  staff_off:  { text:'希望休', bg:'bg-yellow-50',  tc:'text-yellow-700' },
  admin_off:  { text:'管理休', bg:'bg-red-50',     tc:'text-red-600' },
  confirmed:  { text:'●',    bg:'bg-blue-50',     tc:'text-blue-700' },
  none:       { text:'',      bg:'bg-gray-50',     tc:'text-gray-300' },
};

const STORE_OPTIONS = ['Virgo', 'Regina'];

// 店舗ごとの色設定
const storeColor = (store) => {
  if (store === 'Virgo')  return { text: 'text-purple-600', badge: 'bg-purple-100 text-purple-700', btn: 'bg-purple-600', outline: 'text-purple-500 border-purple-200' };
  if (store === 'Regina') return { text: 'text-pink-600',   badge: 'bg-pink-100 text-pink-700',     btn: 'bg-pink-600',   outline: 'text-pink-500 border-pink-200' };
  return { text: '', badge: '', btn: '', outline: '' };
};

export default function ScheduleGrid() {
  const [months]  = useState(getAvailableMonths);
  const [ym, setYM] = useState(months[0]);
  const [staffList,       setStaffList]       = useState([]);
  const [submissions,     setSubmissions]     = useState({});
  const [overrides,       setOverrides]       = useState({});
  const [shiftStartTimes, setShiftStartTimes] = useState({});
  const [shiftEndTimes,   setShiftEndTimes]   = useState({});
  const [shiftStores,     setShiftStores]     = useState({});
  const [clockedMap,      setClockedMap]      = useState({});
  const [cellModal,       setCellModal]       = useState(null);
  const [modalStartTime,  setModalStartTime]  = useState('18:00');
  const [modalEndTime,    setModalEndTime]    = useState('22:00');
  const [dayModal,        setDayModal]        = useState(null);
  const [saving,          setSaving]          = useState(false);
  const [notifying,       setNotifying]       = useState(false);
  const [sentNotifications, setSentNotifications] = useState({});
  const [viewMode,        setViewMode]        = useState('grid'); // 'grid' | 'list'
  const [storeFilter,     setStoreFilter]     = useState('all'); // 'all' | 'Virgo' | 'Regina'
  const [weekIdx,         setWeekIdx]         = useState(0);

  useEffect(() => {
    getDocs(collection(db,'users')).then(snap =>
      setStaffList(snap.docs.map(d=>({id:d.id,...d.data()})).filter(u => u.role === 'staff'))
    );
  }, []);

  useEffect(() => {
    const load = async () => {
      const monthStart = `${ym}-01`;
      const monthEnd = `${ym}-32`;
      const [subSnap, ovSnap, attSnap, notifSnap] = await Promise.all([
        getDocs(query(collection(db,'submissions'), where('yearMonth','==',ym))),
        getDoc(doc(db,'adminOverrides',ym)),
        getDocs(query(collection(db,'attendance'), where('date','>=',monthStart), where('date','<',monthEnd))),
        getDocs(query(collection(db,'notifications'), where('yearMonth','==',ym))),
      ]);
      const subs = {};
      subSnap.docs.forEach(d => { if(d.data().yearMonth===ym) subs[d.data().staffId]=d.data(); });
      setSubmissions(subs);

      const ovData = ovSnap.exists() ? ovSnap.data() : {};
      setOverrides(ovData.overrides ?? {});
      setShiftStartTimes(ovData.shiftStartTimes ?? {});
      setShiftEndTimes(ovData.shiftEndTimes ?? {});
      setShiftStores(ovData.shiftStores ?? {});

      const notifs = {};
      notifSnap.docs.forEach(d => { if (d.data().yearMonth === ym) notifs[d.id] = d.data(); });
      setSentNotifications(notifs);

      const cmap = {};
      attSnap.docs.forEach(d => {
        const r = d.data();
        if (r.date?.startsWith(ym) && r.clockInAt) cmap[r.date] = (cmap[r.date] ?? 0) + 1;
      });
      setClockedMap(cmap);
    };
    load();
  }, [ym]);

  const [y, mo] = ym.split('-').map(Number);
  const days = Array.from({length: new Date(y,mo,0).getDate()}, (_,i)=>i+1);

  useEffect(() => { setWeekIdx(0); }, [ym]);

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const weekDays = weeks[weekIdx] ?? [];

  const getCellStatus = (staffId, day) => {
    const ds = `${ym}-${String(day).padStart(2,'0')}`;
    const ov = overrides[`${staffId}_${ds}`];
    if (ov) return ov;
    const sub = submissions[staffId];
    if (!sub) return 'none';
    if (sub.daysOff?.[ds]==='staff') return 'staff_off';
    return 'available';
  };

  // フィルター適用済みのセル表示情報を返す
  const getCellInfo = (staffId, day) => {
    const ds = `${ym}-${String(day).padStart(2,'0')}`;
    const key = `${staffId}_${ds}`;
    const status = getCellStatus(staffId, day);

    if (storeFilter !== 'all') {
      // 店舗フィルターモード：その店舗で確定されている日だけ表示
      if (status === 'confirmed' && shiftStores[key] === storeFilter) {
        return { type: 'store_confirmed', startT: shiftStartTimes[key], endT: shiftEndTimes[key], store: shiftStores[key] };
      }
      return { type: 'filtered_none' };
    }

    // 全店舗モード
    if (status === 'confirmed') {
      return { type: 'confirmed', startT: shiftStartTimes[key], endT: shiftEndTimes[key], store: shiftStores[key] };
    }
    return { type: status, c: CELL[status] ?? CELL.none };
  };

  const openModal = (staff, day) => {
    const ds = `${ym}-${String(day).padStart(2,'0')}`;
    const status = getCellStatus(staff.id, day);
    const key = `${staff.id}_${ds}`;
    setCellModal({staffId:staff.id, staffName:staff.name, dateStr:ds, status});
    const subStart = submissions[staff.id]?.startTime;
    setModalStartTime(shiftStartTimes[key] ?? subStart ?? '19:00');
    setModalEndTime(shiftEndTimes[key] ?? '22:00');
  };

  const openDayModal = (day) => {
    const ds = `${ym}-${String(day).padStart(2,'0')}`;
    const dow = new Date(y, mo-1, day).getDay();
    const dayLabel = `${parseInt(ym.split('-')[1])}月${day}日（${'日月火水木金土'[dow]}）`;
    const confirmedStaff = staffList.filter(s => getCellStatus(s.id, day) === 'confirmed');
    const pending = {};
    confirmedStaff.forEach(s => {
      const key = `${s.id}_${ds}`;
      pending[key] = shiftStores[key] ?? '';
    });
    setDayModal({ ds, dayLabel, confirmedStaff, pending });
  };

  const updateDayModalPending = (key, store) => {
    setDayModal(prev => ({ ...prev, pending: { ...prev.pending, [key]: store } }));
  };

  const saveDayStores = async () => {
    if (!dayModal) return;
    setSaving(true);
    const nextStores = { ...shiftStores };
    Object.entries(dayModal.pending).forEach(([key, store]) => {
      if (store) nextStores[key] = store;
      else delete nextStores[key];
    });
    await setDoc(doc(db,'adminOverrides',ym), {
      yearMonth: ym, overrides, shiftStartTimes, shiftEndTimes, shiftStores: nextStores,
    });
    setShiftStores(nextStores);
    setDayModal(null);
    setSaving(false);
  };

  const saveOverride = async (staffId, dateStr, newStatus) => {
    setSaving(true);
    const key = `${staffId}_${dateStr}`;
    const nextOvr    = {...overrides};
    const nextStarts = {...shiftStartTimes};
    const nextEnds   = {...shiftEndTimes};
    const nextStores = {...shiftStores};

    if (newStatus === 'clear') {
      delete nextOvr[key]; delete nextStarts[key]; delete nextEnds[key]; delete nextStores[key];
    } else {
      nextOvr[key] = newStatus;
      if (newStatus === 'confirmed') {
        nextStarts[key] = modalStartTime;
        nextEnds[key]   = modalEndTime;
      } else {
        delete nextStarts[key]; delete nextEnds[key]; delete nextStores[key];
      }
    }

    await setDoc(doc(db,'adminOverrides',ym), {
      yearMonth: ym, overrides: nextOvr, shiftStartTimes: nextStarts, shiftEndTimes: nextEnds, shiftStores: nextStores,
    });
    setOverrides(nextOvr); setShiftStartTimes(nextStarts); setShiftEndTimes(nextEnds); setShiftStores(nextStores);
    setCellModal(null);
    setSaving(false);
  };

  const dayCount = (day) => {
    if (storeFilter === 'all') {
      return staffList.filter(s => getCellStatus(s.id, day) === 'confirmed').length;
    }
    const ds = `${ym}-${String(day).padStart(2,'0')}`;
    return staffList.filter(s => {
      const key = `${s.id}_${ds}`;
      return getCellStatus(s.id, day) === 'confirmed' && shiftStores[key] === storeFilter;
    }).length;
  };

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
      batch.set(doc(db, 'notifications', s.id), { staffId: s.id, yearMonth: ym, message: msg, sentAt: now });
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

  // セルJSXのレンダリングヘルパー
  const renderCell = (info, small = false) => {
    if (info.type === 'filtered_none') {
      return <span className="text-gray-200">—</span>;
    }
    if (info.type === 'confirmed' || info.type === 'store_confirmed') {
      const sc = info.store ? storeColor(info.store) : null;
      return small ? (
        <>
          <span className="text-[9px] font-bold text-blue-700 leading-none">●</span>
          {info.startT && <span className="text-[8px] text-blue-600 leading-none mt-px">{info.startT}</span>}
          {info.endT   && <span className="text-[7px] text-blue-400 leading-none">〜{info.endT}</span>}
          {info.store  && <span className={`text-[7px] font-bold leading-none truncate max-w-full px-0.5 ${sc?.text}`}>{info.store}</span>}
        </>
      ) : (
        <div className="flex flex-col items-center py-0.5 leading-none">
          <span className="text-[10px] font-bold text-blue-700">●</span>
          {info.startT && <span className="text-[8px] text-blue-600 font-medium">{info.startT}</span>}
          {info.endT   && <span className="text-[7px] text-blue-400">〜{info.endT}</span>}
          {info.store  && <span className={`text-[7px] font-bold truncate max-w-full px-0.5 ${sc?.text}`}>{info.store}</span>}
        </div>
      );
    }
    const c = info.c ?? CELL.none;
    return <span className={`${small ? 'text-[11px]' : 'text-[11px]'} font-medium ${c.tc}`}>{c.text}</span>;
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

      {/* 表示切替 + 店舗フィルター */}
      <div className="bg-white border-b border-gray-100 px-3 py-1.5 flex-shrink-0 flex items-center justify-between gap-2">
        {/* グリッド / 一覧 */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button onClick={()=>setViewMode('grid')}
            className={`px-3 py-1 font-medium transition-colors ${viewMode==='grid'?'bg-blue-600 text-white':'text-gray-500 active:bg-gray-50'}`}>
            グリッド
          </button>
          <button onClick={()=>setViewMode('list')}
            className={`px-3 py-1 font-medium transition-colors ${viewMode==='list'?'bg-blue-600 text-white':'text-gray-500 active:bg-gray-50'}`}>
            一覧
          </button>
        </div>
        {/* 店舗フィルター */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button onClick={()=>setStoreFilter('all')}
            className={`px-3 py-1 font-medium transition-colors ${storeFilter==='all'?'bg-gray-700 text-white':'text-gray-500 active:bg-gray-50'}`}>
            全店
          </button>
          <button onClick={()=>setStoreFilter('Virgo')}
            className={`px-3 py-1 font-medium transition-colors ${storeFilter==='Virgo'?'bg-purple-600 text-white':'text-purple-500 active:bg-purple-50'}`}>
            Virgo
          </button>
          <button onClick={()=>setStoreFilter('Regina')}
            className={`px-3 py-1 font-medium transition-colors ${storeFilter==='Regina'?'bg-pink-600 text-white':'text-pink-500 active:bg-pink-50'}`}>
            Regina
          </button>
        </div>
      </div>

      {/* 通知管理バー */}
      {(notNotified.length > 0 || Object.keys(sentNotifications).length > 0) && (
        <div className="bg-red-50 border-b border-red-100 px-3 py-2 flex-shrink-0 space-y-1.5">
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
          {Object.keys(sentNotifications).length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] text-orange-500 font-semibold">通知済み:</span>
              {Object.entries(sentNotifications).map(([sid]) => {
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

      {viewMode === 'list' ? (
        <>
          {/* 週ナビゲーション */}
          <div className="bg-white border-b border-gray-100 px-3 py-1.5 flex-shrink-0 flex items-center justify-between">
            <button onClick={() => setWeekIdx(i => Math.max(0, i-1))} disabled={weekIdx === 0}
              className="px-3 py-1 rounded-lg border border-gray-200 text-sm text-gray-600 font-medium disabled:opacity-30 active:bg-gray-50">
              ‹ 前週
            </button>
            <span className="text-xs font-semibold text-gray-600">
              {parseInt(ym.split('-')[1])}月{weekDays[0]}日〜{weekDays[weekDays.length-1]}日
            </span>
            <button onClick={() => setWeekIdx(i => Math.min(weeks.length-1, i+1))} disabled={weekIdx === weeks.length-1}
              className="px-3 py-1 rounded-lg border border-gray-200 text-sm text-gray-600 font-medium disabled:opacity-30 active:bg-gray-50">
              次週 ›
            </button>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col text-xs">
            {/* ヘッダー行（タップで店舗割り当て） */}
            <div className="flex flex-shrink-0 bg-gray-100 border-b border-gray-300">
              <div className="w-[52px] flex-shrink-0 border-r border-gray-300 px-1 py-1 font-bold text-gray-600 text-[10px]">名前</div>
              {weekDays.map(day => {
                const dow = new Date(y, mo-1, day).getDay();
                return (
                  <div key={day}
                    onClick={() => openDayModal(day)}
                    className={`flex-1 text-center py-1 border-r border-gray-200 cursor-pointer active:bg-gray-200 select-none
                      ${dow===0?'text-red-500':dow===6?'text-blue-500':'text-gray-600'}`}>
                    <div className="font-bold text-[11px]">{day}日</div>
                    <div className="text-[9px]">{['日','月','火','水','木','金','土'][dow]}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex-1 flex flex-col overflow-hidden divide-y divide-gray-100">
              {staffList.map(staff => (
                <div key={staff.id} className="flex flex-1 min-h-0">
                  <div className={`w-[52px] flex-shrink-0 flex items-center px-1 border-r border-gray-200 text-[10px] font-medium truncate
                    ${!submissions[staff.id] ? 'bg-red-50 text-red-600' : 'bg-white text-gray-700'}`}>
                    {staff.name}
                  </div>
                  {weekDays.map(day => {
                    const ds = `${ym}-${String(day).padStart(2,'0')}`;
                    const info = getCellInfo(staff.id, day);
                    const status = getCellStatus(staff.id, day);
                    const dow = new Date(y, mo-1, day).getDay();
                    const c = CELL[status] ?? CELL.none;
                    return (
                      <div key={day}
                        onClick={() => openModal(staff, day)}
                        className={`flex-1 flex flex-col items-center justify-center border-r border-gray-100 cursor-pointer active:opacity-60 min-w-0
                          ${dow===0?'bg-red-50':dow===6?'bg-blue-50':
                            info.type === 'filtered_none' ? 'bg-gray-50' : c.bg}`}>
                        {renderCell(info, true)}
                      </div>
                    );
                  })}
                </div>
              ))}
              {/* 予定行 */}
              <div className="flex flex-shrink-0 bg-gray-50 border-t border-gray-200">
                <div className="w-[52px] flex-shrink-0 flex items-center justify-center border-r border-gray-200 text-[10px] font-bold text-gray-600 py-1">予定</div>
                {weekDays.map(day => (
                  <div key={day} className="flex-1 flex items-center justify-center border-r border-gray-100 text-[11px] font-bold text-gray-700 py-1">
                    {dayCount(day)||''}
                  </div>
                ))}
              </div>
              {/* 打刻行（全店舗モードのみ表示） */}
              {storeFilter === 'all' && (
                <div className="flex flex-shrink-0 bg-blue-50 border-t border-blue-100">
                  <div className="w-[52px] flex-shrink-0 flex items-center justify-center border-r border-blue-100 text-[10px] font-bold text-blue-600 py-1">打刻</div>
                  {weekDays.map(day => {
                    const ds = `${ym}-${String(day).padStart(2,'0')}`;
                    const cnt = clockedMap[ds] ?? 0;
                    return (
                      <div key={day} className={`flex-1 flex items-center justify-center border-r border-blue-100 text-[11px] font-bold py-1 ${cnt > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                        {cnt || ''}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 overflow-auto">
            <table className="border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="sticky left-0 z-20 bg-gray-100 border border-gray-300 px-2 py-1.5 text-left min-w-[60px] whitespace-nowrap">名前</th>
                  {days.map(day=>{
                    const dow = new Date(y,mo-1,day).getDay();
                    return (
                      <th key={day}
                        onClick={() => openDayModal(day)}
                        className={`border border-gray-300 text-center min-w-[36px] py-1 cursor-pointer active:opacity-60 select-none
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
                      const info = getCellInfo(staff.id, day);
                      const status = getCellStatus(staff.id, day);
                      const c = CELL[status] ?? CELL.none;
                      const dow = new Date(y,mo-1,day).getDay();
                      return (
                        <td key={day}
                          onClick={() => openModal(staff, day)}
                          className={`border border-gray-200 text-center cursor-pointer active:opacity-60
                            ${dow===0?'bg-red-50':dow===6?'bg-blue-50':
                              info.type === 'filtered_none' ? 'bg-gray-50' : c.bg}`}>
                          {renderCell(info, false)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* 予定行 */}
                <tr>
                  <td className="sticky left-0 z-10 bg-gray-100 border border-gray-300 px-2 py-1 font-bold text-gray-600 text-center whitespace-nowrap text-[10px]">予定</td>
                  {days.map(day=>(
                    <td key={day} className="border border-gray-200 bg-gray-50 text-center">
                      <span className="text-[11px] font-bold text-gray-700">{dayCount(day)||''}</span>
                    </td>
                  ))}
                </tr>
                {/* 打刻行（全店舗モードのみ） */}
                {storeFilter === 'all' && (
                  <tr>
                    <td className="sticky left-0 z-10 bg-blue-50 border border-gray-300 px-2 py-1 font-bold text-blue-600 text-center whitespace-nowrap text-[10px]">打刻</td>
                    {days.map(day=>{
                      const ds = `${ym}-${String(day).padStart(2,'0')}`;
                      const cnt = clockedMap[ds] ?? 0;
                      return (
                        <td key={day} className="border border-gray-200 bg-blue-50 text-center">
                          <span className={`text-[11px] font-bold ${cnt > 0 ? 'text-blue-600' : 'text-gray-300'}`}>{cnt || ''}</span>
                        </td>
                      );
                    })}
                  </tr>
                )}
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
            <div className="flex items-center gap-1 text-xs text-purple-600 font-semibold">■ Virgo</div>
            <div className="flex items-center gap-1 text-xs text-pink-600 font-semibold">■ Regina</div>
          </div>
        </>
      )}

      {/* セル編集モーダル */}
      {cellModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={e=>e.target===e.currentTarget&&setCellModal(null)}>
          <div className="bg-white w-full rounded-t-2xl p-5">
            <h2 className="font-bold text-base">{cellModal.staffName}</h2>
            <p className="text-gray-400 text-xs mb-4">{cellModal.dateStr}</p>

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

      {/* 日付ヘッダー店舗割り当てモーダル */}
      {dayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={e=>e.target===e.currentTarget&&setDayModal(null)}>
          <div className="bg-white w-full rounded-t-2xl p-5 max-h-[80vh] flex flex-col">
            <h2 className="font-bold text-base mb-0.5">店舗割り当て</h2>
            <p className="text-gray-400 text-xs mb-4">{dayModal.dayLabel}</p>

            {dayModal.confirmedStaff.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">この日の確定スタッフはいません</p>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                {dayModal.confirmedStaff.map(staff => {
                  const key = `${staff.id}_${dayModal.ds}`;
                  const current = dayModal.pending[key] ?? '';
                  return (
                    <div key={staff.id} className="flex items-center justify-between py-1">
                      <span className="text-sm font-medium text-gray-700">{staff.name}</span>
                      <div className="flex gap-2">
                        {STORE_OPTIONS.map(store => {
                          const sc = storeColor(store);
                          const isSelected = current === store;
                          return (
                            <button key={store}
                              onClick={() => updateDayModalPending(key, isSelected ? '' : store)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors
                                ${isSelected ? `${sc.btn} text-white border-transparent` : sc.outline}`}>
                              {store}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button onClick={saveDayStores} disabled={saving}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm disabled:opacity-50 active:opacity-80">
              {saving ? '保存中...' : '保存'}
            </button>
            <button onClick={() => setDayModal(null)} className="w-full py-3 rounded-xl border border-gray-200 text-gray-500 text-sm mt-2">
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
