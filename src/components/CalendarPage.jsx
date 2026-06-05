import { useState, useEffect } from 'react';
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
  const [sheet, setSheet]   = useState(false);
  const [startTime, setStart] = useState('18:00');
  const [endTime,   setEnd]   = useState('23:00');

  // 自分の出勤可能日を読み込む
  useEffect(() => {
    getDoc(doc(db, 'availability', user.uid)).then((snap) => {
      if (snap.exists()) setMyAvail(snap.data().dates ?? {});
    });
  }, [user.uid]);

  // 管理者：全スタッフの出勤可能日を読み込む
  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      getDocs(collection(db, 'availability')),
      getDocs(collection(db, 'users')),
    ]).then(([avSnap, uSnap]) => {
      const av = {};
      avSnap.docs.forEach((d) => { av[d.id] = d.data().dates ?? {}; });
      setAllAvail(av);
      setStaffList(uSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [isAdmin, month, year]);

  const saveAvail = async (dateStr, available, s, e) => {
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

  const availableStaff = pickedDate && isAdmin
    ? staffList.filter((s) => allAvail[s.id]?.[pickedDate]?.available).map((s) => ({
        ...s,
        startTime: allAvail[s.id][pickedDate].startTime,
        endTime:   allAvail[s.id][pickedDate].endTime,
      }))
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
                  ${mine ? 'bg-green-50 border-green-300' : 'active:bg-gray-50'}
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

        {/* 管理者：選択日のスタッフ一覧 */}
        {isAdmin && pickedDate && (
          <div className="mt-4 bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="font-semibold text-sm mb-3">{pickedDate} 出勤可能スタッフ</h3>
            {availableStaff.length === 0 ? (
              <p className="text-gray-400 text-sm">出勤可能なスタッフはいません</p>
            ) : (
              <div className="space-y-2">
                {availableStaff.map((s) => (
                  <div key={s.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                    <span className="font-medium text-sm">{s.name}</span>
                    <span className="text-xs text-gray-500">{s.startTime} 〜 {s.endTime}</span>
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

      {/* 時間入力シート（スタッフ用） */}
      {sheet && pickedDate && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div className="bg-white w-full rounded-t-2xl p-6">
            <h2 className="font-bold text-base mb-1">{pickedDate}</h2>
            <p className="text-gray-400 text-xs mb-5">出勤可能な時間を入力してください</p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">開始時間</label>
                <input type="time" value={startTime} onChange={(e) => setStart(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-center text-base" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">終了時間</label>
                <input type="time" value={endTime} onChange={(e) => setEnd(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-center text-base" />
              </div>
            </div>

            <div className="flex gap-2">
              {myAvail[pickedDate] && (
                <button onClick={() => saveAvail(pickedDate, false)} className="flex-1 py-3 rounded-xl border border-red-200 text-red-500 text-sm font-semibold">
                  削除
                </button>
              )}
              <button onClick={() => setSheet(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold">
                キャンセル
              </button>
              <button onClick={() => saveAvail(pickedDate, true, startTime, endTime)}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold active:bg-blue-700">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
