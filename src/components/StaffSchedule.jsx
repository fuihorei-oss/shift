import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';

function getAvailableMonths() {
  const t = new Date();
  const result = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(t.getFullYear(), t.getMonth() + i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export default function StaffSchedule() {
  const { user } = useAuth();
  const [months]          = useState(getAvailableMonths);
  const [ym, setYM]       = useState(months[0]);
  const [submission,      setSubmission]      = useState(null);
  const [overrides,       setOverrides]       = useState({});
  const [shiftStartTimes, setShiftStartTimes] = useState({});
  const [shiftEndTimes,   setShiftEndTimes]   = useState({});
  const [shiftStores,     setShiftStores]     = useState({});

  useEffect(() => {
    const load = async () => {
      const [subSnap, ovSnap] = await Promise.all([
        getDoc(doc(db, 'submissions', `${user.uid}_${ym}`)),
        getDoc(doc(db, 'adminOverrides', ym)),
      ]);
      setSubmission(subSnap.exists() ? subSnap.data() : null);
      const ov = ovSnap.exists() ? ovSnap.data() : {};
      setOverrides(ov.overrides ?? {});
      setShiftStartTimes(ov.shiftStartTimes ?? {});
      setShiftEndTimes(ov.shiftEndTimes ?? {});
      setShiftStores(ov.shiftStores ?? {});
    };
    load();
  }, [user.uid, ym]);

  const [y, mo] = ym.split('-').map(Number);
  const days = Array.from({ length: new Date(y, mo, 0).getDate() }, (_, i) => i + 1);

  const getStatus = (day) => {
    const ds = `${ym}-${String(day).padStart(2, '0')}`;
    const ov = overrides[`${user.uid}_${ds}`];
    if (ov) return ov;
    if (!submission) return 'none';
    if (submission.daysOff?.[ds] === 'staff') return 'staff_off';
    return 'available';
  };

  const confirmedDays = days.filter(d => getStatus(d) === 'confirmed');

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 月タブ */}
      <div className="bg-white border-b border-gray-100 flex-shrink-0 overflow-x-auto">
        <div className="flex min-w-max">
          {months.map(m => (
            <button key={m} onClick={() => setYM(m)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap ${ym === m ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'}`}>
              {m.split('-')[0]}年{parseInt(m.split('-')[1])}月
            </button>
          ))}
        </div>
      </div>

      {/* サマリーバー */}
      <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex-shrink-0 flex items-center gap-3">
        <span className="text-xs text-blue-700 font-semibold">
          出勤確定 <span className="text-base font-bold">{confirmedDays.length}</span> 日
        </span>
        {!submission && (
          <span className="text-xs text-red-500 font-medium">未提出</span>
        )}
      </div>

      {/* 日程一覧 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {days.map(day => {
          const ds  = `${ym}-${String(day).padStart(2, '0')}`;
          const status = getStatus(day);
          if (status === 'none') return null;

          const dow  = new Date(y, mo - 1, day).getDay();
          const isSun = dow === 0;
          const isSat = dow === 6;
          const key  = `${user.uid}_${ds}`;
          const startT = shiftStartTimes[key];
          const endT   = shiftEndTimes[key];
          const store  = shiftStores[key];

          const isConfirmed = status === 'confirmed';
          const isOff       = status === 'staff_off' || status === 'admin_off';

          return (
            <div key={day} className={`flex items-center px-3 py-2.5 rounded-xl border
              ${isConfirmed ? 'bg-blue-50 border-blue-200' :
                isOff       ? 'bg-yellow-50 border-yellow-200' :
                              'bg-white border-gray-200'}`}>
              {/* 日付 */}
              <div className="w-10 flex-shrink-0 text-center">
                <div className={`text-sm font-bold ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700'}`}>
                  {day}
                </div>
                <div className={`text-[10px] ${isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-gray-400'}`}>
                  {DOW[dow]}
                </div>
              </div>

              {/* 内容 */}
              <div className="flex-1 ml-3 flex items-center gap-2 flex-wrap">
                {isConfirmed && (
                  <>
                    <span className="text-sm font-bold text-blue-700">● 出勤確定</span>
                    {startT && (
                      <span className="text-xs text-blue-500 font-medium">
                        {startT}{endT ? ` 〜 ${endT}` : ''}
                      </span>
                    )}
                    {store && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${store === 'Virgo' ? 'bg-purple-100 text-purple-700' : 'bg-pink-100 text-pink-700'}`}>
                        {store}
                      </span>
                    )}
                  </>
                )}
                {status === 'available' && (
                  <span className="text-sm text-gray-400">○ 提出済み</span>
                )}
                {status === 'staff_off' && (
                  <span className="text-sm text-yellow-600 font-medium">希望休</span>
                )}
                {status === 'admin_off' && (
                  <span className="text-sm text-red-500 font-medium">管理休み</span>
                )}
              </div>
            </div>
          );
        })}

        {days.every(d => getStatus(d) === 'none') && (
          <div className="text-center py-16 text-gray-400 text-sm">
            シフト提出後に表示されます
          </div>
        )}
      </div>
    </div>
  );
}
