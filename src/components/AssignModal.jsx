import { useState } from 'react';

export default function AssignModal({ position, staffList, currentAssigned, onSave, onClose }) {
  const [selected, setSelected] = useState(new Set(currentAssigned));

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-full rounded-t-2xl max-h-[75vh] flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base">{position}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {staffList.length > 0
                ? `本日出勤可能 ${staffList.length}人`
                : '本日出勤可能なスタッフがいません'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {staffList.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-gray-400 text-sm">この日に出勤可能登録しているスタッフがいません</p>
              <p className="text-gray-300 text-xs mt-1">スタッフにカレンダーから出勤可能日を登録してもらってください</p>
            </div>
          ) : (
            staffList.map((staff) => {
              const checked = selected.has(staff.id);
              return (
                <div
                  key={staff.id}
                  onClick={() => toggle(staff.id)}
                  className={`flex items-center p-3 rounded-xl border cursor-pointer transition-colors ${
                    checked ? 'bg-blue-50 border-blue-300' : 'border-gray-100 active:bg-gray-50'
                  }`}
                >
                  {/* チェックボックス */}
                  <div
                    className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center flex-shrink-0 ${
                      checked ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                    }`}
                  >
                    {checked && <span className="text-white text-xs font-bold">✓</span>}
                  </div>

                  {/* スタッフ情報 */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{staff.name}</div>
                    <div className="text-xs text-gray-400 truncate">{staff.email}</div>
                  </div>

                  {/* 出勤可能時間 */}
                  <div className="ml-2 flex-shrink-0 text-right">
                    <span className="inline-block bg-green-50 text-green-700 text-xs px-2 py-1 rounded-lg font-medium">
                      {staff.startTime} 〜 {staff.endTime}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-gray-100">
          <button
            onClick={() => onSave([...selected])}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold active:bg-blue-700"
          >
            {selected.size > 0 ? `${selected.size}人を配置する` : '配置なしで保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
