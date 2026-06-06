import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import AssignModal from './AssignModal';

// ── レイアウト定義 ─────────────────────────────────────
const SECTIONS = [
  { id: '全体管理', span: 2, subs: ['フロント', 'リスト', 'フロア'] },
  { id: 'リスト',   span: 2, subs: ['フリー', '指名'] },
  { id: 'V',        span: 2, subs: ['V担当', 'PV', 'RV', 'SV・V1・V2'] },
  { id: 'B',        span: 1, subs: ['B担当', 'Bホール', 'ドリンカー'] },
  { id: 'A',        span: 1, subs: ['A担当', 'Aホール', 'ドリンカー'] },
  { id: 'キッチン',  span: 2, subs: ['A側', 'B側'] },
  { id: '卓付き',   span: 2, subs: [] },
  { id: 'ボトル対応', span: 2, subs: [] },
];

// Firestoreのキー：「全体管理_フロント」「V_PV」など
const posKey = (sectionId, sub) => (sub ? `${sectionId}_${sub}` : sectionId);

// span=2 のサブ数に応じたグリッド列数
const gridCols = (count) => {
  if (count <= 2) return 'grid-cols-2';
  if (count === 4) return 'grid-cols-2'; // 2×2
  return 'grid-cols-3';
};

const toDateStr = (d) => d.toLocaleDateString('sv-SE');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const formatDate = (d) =>
  d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

export default function FloorPlanView() {
  const { isAdmin } = useAuth();
  const [date, setDate] = useState(new Date());
  const [assignments, setAssignments] = useState({});
  const [staffList, setStaffList] = useState([]);
  const [availableMap, setAvailableMap] = useState({});
  const [selectedPos, setSelectedPos] = useState(null);  // Firestoreキー
  const [selectedLabel, setSelectedLabel] = useState(''); // 表示名
  const touchX = useRef(null);

  useEffect(() => {
    getDocs(collection(db, 'users')).then((snap) =>
      setStaffList(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  useEffect(() => {
    const dateStr = toDateStr(date);
    getDocs(collection(db, 'availability')).then((snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        const e = d.data().dates?.[dateStr];
        if (e?.available) map[d.id] = e;
      });
      setAvailableMap(map);
    });
  }, [date]);

  useEffect(() => {
    return onSnapshot(doc(db, 'assignments', toDateStr(date)), (snap) =>
      setAssignments(snap.exists() ? snap.data().positions ?? {} : {})
    );
  }, [date]);

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current === null) return;
    const dx = touchX.current - e.changedTouches[0].clientX;
    if (Math.abs(dx) > 50) setDate((p) => addDays(p, dx > 0 ? 1 : -1));
    touchX.current = null;
  };

  const openModal = (sectionId, sub) => {
    if (!isAdmin) return;
    setSelectedPos(posKey(sectionId, sub));
    setSelectedLabel(sub ? `${sectionId} › ${sub}` : sectionId);
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

  const availableStaffList = staffList
    .filter((s) => availableMap[s.id])
    .map((s) => ({ ...s, ...availableMap[s.id] }));

  // span=1 のセクションをペアに
  const rows = [];
  let i = 0;
  while (i < SECTIONS.length) {
    const cur = SECTIONS[i];
    if (cur.span === 1 && SECTIONS[i + 1]?.span === 1) {
      rows.push([cur, SECTIONS[i + 1]]);
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
      <div className="flex-1 overflow-y-auto p-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="border border-gray-300 rounded-xl overflow-hidden max-w-sm mx-auto">
          {rows.map((row, ri) => (
            <div key={ri} className={`flex ${ri > 0 ? 'border-t border-gray-300' : ''}`}>
              {row.map((sec, si) => (
                <div key={sec.id} className={`flex-1 min-w-0 ${si > 0 ? 'border-l border-gray-300' : ''}`}>

                  {/* セクションヘッダー */}
                  <div className="bg-gray-50 border-b border-gray-200 px-2 py-1.5 text-center">
                    <span className="font-bold text-sm text-gray-700">{sec.id}</span>
                  </div>

                  {sec.subs.length > 0 ? (
                    /* ── サブポジションあり ── */
                    sec.span === 2 ? (
                      // span=2: グリッド表示
                      <div className={`p-1.5 grid ${gridCols(sec.subs.length)} gap-1`}>
                        {sec.subs.map((sub) => {
                          const key = posKey(sec.id, sub);
                          const assigned = assignments[key] ?? [];
                          return (
                            <div
                              key={sub}
                              onClick={() => openModal(sec.id, sub)}
                              className={`border border-gray-200 rounded-lg p-1.5 min-h-[52px] flex flex-col
                                ${isAdmin ? 'cursor-pointer active:bg-blue-50' : ''}`}
                            >
                              <div className="text-[10px] text-gray-400 text-center mb-1 font-medium">{sub}</div>
                              <div className="flex flex-wrap gap-0.5 justify-center">
                                {assigned.map((id) => (
                                  <span key={id} className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.5 rounded-full leading-tight">
                                    {getName(id)}
                                  </span>
                                ))}
                                {isAdmin && assigned.length === 0 && (
                                  <span className="text-gray-200 text-[10px]">＋</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // span=1 (B, A): 縦並び
                      <div>
                        {sec.subs.map((sub, idx) => {
                          const key = posKey(sec.id, sub);
                          const assigned = assignments[key] ?? [];
                          return (
                            <div
                              key={sub}
                              onClick={() => openModal(sec.id, sub)}
                              className={`px-2 py-1.5 min-h-[38px]
                                ${idx > 0 ? 'border-t border-gray-100' : ''}
                                ${isAdmin ? 'cursor-pointer active:bg-blue-50' : ''}`}
                            >
                              <div className="text-[10px] text-gray-400 font-medium mb-0.5">{sub}</div>
                              <div className="flex flex-wrap gap-0.5">
                                {assigned.map((id) => (
                                  <span key={id} className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.5 rounded-full leading-tight">
                                    {getName(id)}
                                  </span>
                                ))}
                                {isAdmin && assigned.length === 0 && (
                                  <span className="text-gray-200 text-[10px]">＋</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    /* ── サブポジションなし（キッチン・卓付き・ボトル対応） ── */
                    <div
                      onClick={() => openModal(sec.id, null)}
                      className={`p-2 min-h-[52px] flex flex-wrap gap-1 items-center justify-center
                        ${isAdmin ? 'cursor-pointer active:bg-blue-50' : ''}`}
                    >
                      {(assignments[sec.id] ?? []).map((id) => (
                        <span key={id} className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
                          {getName(id)}
                        </span>
                      ))}
                      {isAdmin && (assignments[sec.id] ?? []).length === 0 && (
                        <span className="text-gray-300 text-xs">＋</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {isAdmin && (
          <p className="text-center text-xs text-gray-400 mt-3">ポジションをタップしてスタッフを配置</p>
        )}
      </div>

      {selectedPos && (
        <AssignModal
          position={selectedLabel}
          staffList={availableStaffList}
          currentAssigned={assignments[selectedPos] ?? []}
          onSave={handleSave}
          onClose={() => setSelectedPos(null)}
        />
      )}
    </div>
  );
}
