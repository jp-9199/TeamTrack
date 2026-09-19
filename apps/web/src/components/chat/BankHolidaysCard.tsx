'use client';

import React from 'react';

export const BankHolidaysCard: React.FC = () => {
  const rows = [
    { date: 'Wednesday, January 1, 2026', day: 'Wednesday', name: "New Year's Day", daysLeft: '-112 days remaining', status: 'Passed', statusBg: '#84CC16', statusText: '#1A2E05' },
    { date: 'Friday, April 3, 2026', day: 'Friday', name: 'Good Friday', daysLeft: '-112 days remaining', status: 'Passed', statusBg: '#84CC16', statusText: '#1A2E05' },
    { date: 'Monday, April 21, 2026', day: 'Monday', name: 'Easter Monday', daysLeft: '-109 days remaining', status: 'Passed', statusBg: '#84CC16', statusText: '#1A2E05' },
    { date: 'Monday, May 4, 2026', day: 'Monday', name: 'Early May bank holiday', daysLeft: '-95 days remaining', status: 'Passed', statusBg: '#84CC16', statusText: '#1A2E05' },
    { date: 'Monday, May 25, 2026', day: 'Monday', name: 'Spring bank holiday', daysLeft: '-74 days remaining', status: 'Passed', statusBg: '#84CC16', statusText: '#1A2E05' },
    { date: 'Monday, August 31, 2026', day: 'Monday', name: 'Summer bank holiday', daysLeft: '-242 days remaining', status: 'Upcoming', statusBg: '#EF4444', statusText: '#ffffff' },
    { date: 'Thursday, December 25, 2026', day: 'Thursday', name: 'Christmas Day', daysLeft: '-261 days remaining', status: 'Upcoming', statusBg: '#EAB308', statusText: '#ffffff' },
    { date: 'Friday, December 28, 2026', day: 'Friday', name: 'Boxing Day', daysLeft: '-264 days remaining', status: 'Upcoming', statusBg: '#EAB308', statusText: '#ffffff' },
  ];

  return (
    <div className="rounded-lg overflow-hidden border border-[#B0B5BA] shadow-sm max-w-[540px] bg-white font-sans text-[11px] select-none">
      {/* Blue Title Banner */}
      <div className="bg-[#4169E1] text-white py-1.5 px-3 text-center font-bold text-[12px] tracking-tight">
        Upcoming bank holidays in UK
        <span className="block text-[10.5px] font-normal opacity-90">2026</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-[#ECEEF0] text-[#242424] border-b border-[#D1D5DB] font-semibold text-[10.5px]">
              <th className="py-1 px-2 border-r border-[#D1D5DB]">Date</th>
              <th className="py-1 px-2 border-r border-[#D1D5DB]">Day of the week</th>
              <th className="py-1 px-2 border-r border-[#D1D5DB]">Bank holiday</th>
              <th className="py-1 px-2 border-r border-[#D1D5DB]">Days Left</th>
              <th className="py-1 px-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-[#E1DFDD] text-[#323130] hover:bg-[#F9FAFB]">
                <td className="py-1 px-2 border-r border-[#E1DFDD] whitespace-nowrap">{row.date}</td>
                <td className="py-1 px-2 border-r border-[#E1DFDD]">{row.day}</td>
                <td className="py-1 px-2 border-r border-[#E1DFDD] font-medium">{row.name}</td>
                <td className="py-1 px-2 border-r border-[#E1DFDD] text-[#616161]">{row.daysLeft}</td>
                <td className="py-0.5 px-1.5 text-center">
                  <span
                    className="inline-block px-2 py-0.5 rounded text-[9.5px] font-semibold"
                    style={{ backgroundColor: row.statusBg, color: row.statusText }}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
