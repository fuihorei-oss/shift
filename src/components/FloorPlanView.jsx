import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import AssignModal from './AssignModal';

// 配置レイアウト定義（画像に合わせた順序）
const LAYOUT = [
  { id: '全体管理', span: 2 },
  { id: 'リスト',   span: 2 },
  { id: 'フロント', span: 2 },
  { id: 'V',        span: 2 },
  { id: 'B',        span: 1 },
  { id: 'A',        span: 1 },
  { id: '卓付き',   span: 2 },
  { id: 'ボトル対応', span: 2 },
];

const toDateStr = (d) => d.toLocaleDateString('sv-SE'); // YYYY-MM-DD

const addDays = (d, n) => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};

const formatDate = (d) =>
  d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

export default function FloorPlanView() {
  const { isAdmin } = useAuth();
  const [date, setDate] = useState(new Date());
  const [assignments, setAssignments] = useState({});
  const [staffList, setStaffList] = useState([]);
  const [selectedPos, setSelectedPos] = useState(null);
  const [availableMap, setAvailableMap] = useState({}); // userId -> {startTime, endTime}
  const touchX = useRef(null);

  // スタッフ一覧取得
  useEffect(() => {
    getDocs(collection(db, 'users')).then((snap) =>
      setStaffList(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  // 出勤可能スタッフを日付ごとに取得
  useEffect(() => {
    const dateStr = toDateStr(date);
    getDocs(collection(db, 'availability')).then((snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        const entry = d.data().dates?.[dateStr];
        if (entry?.available) map[d.id] = entry;
      });
      setAvailableMap(map);
    });
  }, [date]);

  // リアルタイム同期
  useEffect(() => {
    const ref = doc(db, 'assignments', toDateStr(date));
    return onSnapshot(ref, (snap) => {
      setAssignments(snap.exists() ? snap.data().positions ?? {} : {});
    });
  }, [date]);

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current === null) return;
    const dx = touchX.current - e.changedTouches[0].clientX;
    if (Math.abs(dx) > 50) setDate((prev) => addDays(prev, dx > 0 ? 1 : -1));
    touchX.current = null;
  };

  const handleSave = async (staffIds) => {
    const dateStr = toDateStr(date);
    await setDoc(
      doc(db, 'assignments', dateStr),
      { date: dateStr, positions: { ...assignments, [selectedPos]: staffIds } },
      { merge: true }
    );
    setSelectedPos(null);
  };

  const getName = (id) => staffList.find((s) => s.id === id)?.name ?? id;

  // B/A を隣接させてグリッド行を組み立て
  const rows = [];
  let i = 0;
  while (i < LAYOUT.length) {
    const cur = LAYOUT[i];
    if (cur.span === 1 && LAYOUT[i + 1]?.span === 1) {
      rows.push([cur, LAYOUT[i + 1]]);
      i += 2;
    } else {
      rows.push([cur]);
      i++;
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* 日付ナビ */}
      <div className="bg-white border-b border-gray-100 px-2 py-3 flex items-center justify-between flex-shrink-0">
        <button onClick={() => setDate((d) => addDays(d, -1))} className="p-3 text-gray-500 text-xl">‹</button>
        <span className="font-semibold text-sm">{formatDate(date)}</span>
        <button onClick={() => setDate((d) => addDays(d, 1))} className="p-3 text-gray-500 text-xl">›</button>
      </div>

      {/* 配置図 */}
      <div
        className="flex-1 overflow-y-auto p-3"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="border border-gray-300 rounded-xl overflow-hidden max-w-sm mx-auto">
          {rows.map((row, ri) => (
            <div key={ri} className="flex">
              {row.map((pos) => {
                const assigned = assignments[pos.id] ?? [];
                return (
                  <div
                    key={pos.id}
                    onClick={() => isAdmin && setSelectedPos(pos.id)}
                    className={`flex-1 border-gray-300 p-3 min-h-[72px] flex flex-col items-center gap-1
                      ${ri > 0 ? 'border-t' : ''}
                      ${pos.span === 1 && row[0]?.id !== pos.id ? 'border-l' : ''}
                      ${isAdmin ? 'cursor-pointer active:bg-gray-50' : ''}
                    `}
                  >
                    <span className="font-bold text-sm text-gray-700">{pos.id}</span>
                    <div className="flex flex-wrap gap-1 justify-center">
                      {assigned.map((id) => (
                        <span key={id} className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
                          {getName(id)}
                        </span>
                      ))}
                    </div>
                    {isAdmin && assigned.length === 0 && (
                      <span className="text-gray-300 text-xs">＋</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {isAdmin && (
          <p className="text-center text-xs text-gray-400 mt-3">ポジションをタップしてスタッフを配置</p>
        )}
      </div>

      {selectedPos && (
        <AssignModal
          position={selectedPos}
          staffList={staffList
            .filter((s) => availableMap[s.id])
            .map((s) => ({ ...s, startTime: availableMap[s.id].startTime, endTime: availableMap[s.id].endTime }))}
          currentAssigned={assignments[selectedPos] ?? []}
          onSave={handleSave}
          onClose={() => setSelectedPos(null)}
        />
      )}
    </div>
  );
}
