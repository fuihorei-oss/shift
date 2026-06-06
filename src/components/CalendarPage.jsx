import { useState, useEffect, useCallback } from 'react';
import { doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';

const toDateStr = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const TODAY = new Date().toLocaleDateString('sv-SE');
const DAYS = ['日', '月', '火', '水', '木', '金', '土'];

export default function CalendarPage() {
  const { user, userData, isAdmin } = useAuth();
  const [year, setYear]   = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [myAvail, setMyAvail]   = useState({});
  const [allAvail, setAllAvail] = useState({});
  const [staffList, setStaffList] = useState([]);
  const [pickedDate, setPickedDate] = useState(null);

  // スタッフ用：自分の時間入力シート
  const [sheet, setSheet]     = useState(false);
  const [startTime, setStart] = useState('18:00');
  const [endTime,   setEnd]   = useState('23:00');

  // 管理者用：スタッフ編集シート
  const [editTarget, setEditTarget] = useState(null); // { id, name, startTime, endTime }
  const [editStart, setEditStart]   = useState('18:00');
  const [editEnd,   setEditEnd]     = useState('23:00');

  // 管理者用：スタッフ追加ピッカー
  const [addPicker, setAddPicker]   = useState(false);
  const [addTarget, setAddTarget]   = useState(null); // { id, name }
  const [addStart,  setAddStart]    = useState('18:00');
  const [addEnd,    setAddEnd]      = useState('23:00');
  const [addStep,   setAddStep]     = useState('pick'); // 'pick' | 'time'

  // ── データ読み込み ──────────────────────────────────
  useEffect(() => {
    getDoc(doc(db, 'availability', user.uid)).then((snap) => {
      if (snap.exists()) setMyAvail(snap.data().dates ?? {});
    });
  }, [user.uid]);

  const loadAllAvail = useCallback(async () => {
    const [avSnap, uSnap] = await Promise.all([
      getDocs(collection(db, 'availability')),
      getDocs(collection(db, 'users')),
    ]);
    const av = {};
    avSnap.docs.forEach((d) => { av[d.id] = d.data().dates ?? {}; });
    setAllAvail(av);
    setStaffList(uSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, []);

  useEffect(() => {
    if (isAdmin) loadAllAvail();
  }, [isAdmin, month, year, loadAllAvail]);

  // ── 自分の出勤可能日保存（スタッフ用） ──────────────
  const saveMyAvail = async (dateStr, available, s, e) => {
    const next = { ...myAvail };
    if (available) next[dateStr] = { available: true, startTime: s, endTime: e };
    else delete next[dateStr];
    setMyAvail(next);
    await setDoc(doc(db, 'availability', user.uid), {
      staffId: user.uid,
      staffName: userData?.name ?? user.email,
      dates: next,
    });
    setSheet(false);
    setPickedDate(null);
  };

  // ── 任意スタッフの出勤可能日保存（管理者用） ─────────
  const saveStaffAvail = async (staffId, staffName, dateStr, available, s, e) => {
    const ref = doc(db, 'availability', staffId);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data().dates ?? {} : {};
    const next = { ...existing };
    if (available) next[dateStr] = { available: true, startTime: s, endTime: e };
    else delete next[dateStr];
    await setDoc(ref, { staffId, staffName, dates: next });
    await loadAllAvail();
  };

  // ── 日付タップ ──────────────────────────────────────
  const onDayClick = (dateStr) => {
    setPickedDate(dateStr);
    if (isAdmin) return;
    const cur = myAvail[dateStr];
    setStart(cur?.startTime ?? '18:00');
    setEnd(cur?.endTime   ?? '23:00');
    setSheet(true);
  };

  const prevMonth = () => month === 0 ? (setYear((y) => y - 1), setMonth(11)) : setMonth((m) => m - 1);
  const nextMonth = () => month === 11 ? (setYear((y) => y + 1), setMonth(0))  : setMonth((m) => m + 1);

  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();

  // 選択日の出勤可能スタッフ
  const availableStaff = pickedDate && isAdmin
    ? staffList.filter((s) => allAvail[s.id]?.[pickedDate]?.available).map((s) => ({
        ...s,
        startTime: allAvail[s.id][pickedDate].startTime,
        endTime:   allAvail[s.id][pickedDate].endTime,
      }))
    : [];

  // 未登録スタッフ（追加ピッカー用）
  const unavailableStaff = pickedDate
    ? staffList.filter((s) => !allAvail[s.id]?.[pickedDate]?.available)
    : [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 月ナビ */}
      <div className="bg-white border-b border-gray-100 px-2 py-3 flex items-center justify-between flex-shrink-0">
        <button onClick={prevMonth} className="p-3 text-gray-500 text-xl">‹</button>
        <span className="font-semibold text-sm">{year}年{month + 1}月</span>
        <button onClick={nextMonth} className="p-3 text-gray-500 text-xl">›</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map((d, i) => (
            <div key={d} className={`text-center text-xs py-1 font-medium ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* カレンダーグリッド */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstWeekday }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const day = idx + 1;
            const dateStr = toDateStr(year, month, day);
            const mine = myAvail[dateStr];
            const cnt  = isAdmin ? Object.values(allAvail).filter((d) => d[dateStr]?.available).length : 0;
            const isToday = dateStr === TODAY;
            return (
              <div
                key={day}
                onClick={() => onDayClick(dateStr)}
                className={`rounded-lg border min-h-[52px] p-1 flex flex-col items-center cursor-pointer
                  ${isToday ? 'border-blue-400' : 'border-gray-100'}
                  ${mine && !isAdmin ? 'bg-green-50 border-green-300' : 'active:bg-gray-50'}
                  ${pickedDate === dateStr && isAdmin ? 'ring-2 ring-blue-400' : ''}
                `}
              >
                <span className={`text-sm font-medium ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>{day}</span>
                {mine && !isAdmin && (
                  <span className="text-green-600 text-[10px] leading-tight">{mine.startTime}</span>
                )}
                {isAdmin && cnt > 0 && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1 mt-0.5">{cnt}人</span>
                )}
              </div>
            );
          })}
        </div>

        {/* 管理者：選択日のスタッフ一覧（編集機能付き） */}
        {isAdmin && pickedDate && (
          <div className="mt-4 bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">{pickedDate} 出勤可能スタッフ</h3>
              <button
                onClick={() => { setAddStep('pick'); setAddPicker(true); }}
                className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold"
              >
                ＋ 追加
              </button>
            </div>

            {availableStaff.length === 0 ? (
              <p className="text-gray-400 text-sm">出勤可能なスタッフはいません</p>
            ) : (
              <div className="space-y-1">
                {availableStaff.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="font-medium text-sm">{s.name}</div>
                      <div className="text-xs text-gray-400">{s.startTime} 〜 {s.endTime}</div>
                    </div>
                    <div className="flex gap-1">
                      {/* 編集 */}
                      <button
                        onClick={() => {
                          setEditTarget({ id: s.id, name: s.name });
                          setEditStart(s.startTime);
                          setEditEnd(s.endTime);
                        }}
                        className="text-xs border border-gray-200 px-2 py-1 rounded-lg text-gray-600"
                      >
                        編集
                      </button>
                      {/* 削除 */}
                      <button
                        onClick={() => {
                          if (window.confirm(`${s.name} の ${pickedDate} の出勤登録を削除しますか？`)) {
                            saveStaffAvail(s.id, s.name, pickedDate, false);
                          }
                        }}
                        className="text-xs border border-red-200 px-2 py-1 rounded-lg text-red-500"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!isAdmin && (
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
            <div className="w-4 h-4 bg-green-50 border border-green-300 rounded" />
            <span>出勤可能日（タップして編集）</span>
          </div>
        )}
      </div>

      {/* ── スタッフ用：時間入力シート ── */}
      {sheet && pickedDate && (
        <BottomSheet title={pickedDate} onClose={() => setSheet(false)}>
          <p className="text-gray-400 text-xs mb-5">出勤可能な時間を入力してください</p>
          <TimeInputs start={startTime} end={endTime} onStart={setStart} onEnd={setEnd} />
          <div className="flex gap-2 mt-6">
            {myAvail[pickedDate] && (
              <button onClick={() => saveMyAvail(pickedDate, false)}
                className="flex-1 py-3 rounded-xl border border-red-200 text-red-500 text-sm font-semibold">削除</button>
            )}
            <button onClick={() => setSheet(false)}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold">キャンセル</button>
            <button onClick={() => saveMyAvail(pickedDate, true, startTime, endTime)}
              className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold">保存</button>
          </div>
        </BottomSheet>
      )}

      {/* ── 管理者用：スタッフ編集シート ── */}
      {editTarget && pickedDate && (
        <BottomSheet title={`${editTarget.name} — ${pickedDate}`} onClose={() => setEditTarget(null)}>
          <p className="text-gray-400 text-xs mb-5">出勤可能時間を編集してください</p>
          <TimeInputs start={editStart} end={editEnd} onStart={setEditStart} onEnd={setEditEnd} />
          <div className="flex gap-2 mt-6">
            <button onClick={() => setEditTarget(null)}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold">キャンセル</button>
            <button
              onClick={async () => {
                await saveStaffAvail(editTarget.id, editTarget.name, pickedDate, true, editStart, editEnd);
                setEditTarget(null);
              }}
              className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold">保存</button>
          </div>
        </BottomSheet>
      )}

      {/* ── 管理者用：スタッフ追加ピッカー ── */}
      {addPicker && pickedDate && (
        <BottomSheet
          title={addStep === 'pick' ? `${pickedDate} — スタッフを選択` : `${addTarget?.name} — 時間を設定`}
          onClose={() => { setAddPicker(false); setAddTarget(null); }}
        >
          {addStep === 'pick' ? (
            <>
              <p className="text-gray-400 text-xs mb-4">まだ登録していないスタッフを選択</p>
              <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                {unavailableStaff.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">全スタッフが登録済みです</p>
                ) : (
                  unavailableStaff.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => { setAddTarget(s); setAddStart('18:00'); setAddEnd('23:00'); setAddStep('time'); }}
                      className="p-3 rounded-xl border border-gray-100 cursor-pointer active:bg-blue-50 flex items-center justify-between"
                    >
                      <span className="font-medium text-sm">{s.name}</span>
                      <span className="text-gray-300 text-sm">›</span>
                    </div>
                  ))
                )}
              </div>
              <button onClick={() => { setAddPicker(false); setAddTarget(null); }}
                className="w-full py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold">閉じる</button>
            </>
          ) : (
            <>
              <p className="text-gray-400 text-xs mb-5">出勤可能時間を入力してください</p>
              <TimeInputs start={addStart} end={addEnd} onStart={setAddStart} onEnd={setAddEnd} />
              <div className="flex gap-2 mt-6">
                <button onClick={() => setAddStep('pick')}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold">戻る</button>
                <button
                  onClick={async () => {
                    await saveStaffAvail(addTarget.id, addTarget.name, pickedDate, true, addStart, addEnd);
                    setAddPicker(false);
                    setAddTarget(null);
                  }}
                  className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold">追加</button>
              </div>
            </>
          )}
        </BottomSheet>
      )}
    </div>
  );
}

// ── 共通コンポーネント ──────────────────────────────
function BottomSheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full rounded-t-2xl p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-base">{title}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TimeInputs({ start, end, onStart, onEnd }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="text-xs text-gray-500 mb-1 block">開始時間</label>
        <input type="time" value={start} onChange={(e) => onStart(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-3 text-center text-base" />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">終了時間</label>
        <input type="time" value={end} onChange={(e) => onEnd(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-3 text-center text-base" />
      </div>
    </div>
  );
}
