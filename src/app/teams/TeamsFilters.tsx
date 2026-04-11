'use client';

import { useEffect, useMemo, useState } from 'react';

type SplitOption = {
  id: string;
  name: string;
};

type Props = {
  selectedRegion: string;
  selectedYear: string;
  selectedSplit: string;
  selectedSortKey: string;
  selectedOrder: 'asc' | 'desc';
  regionOptions: string[];
  yearOptions: string[];
  splitOptionsByRegionYear: Record<string, SplitOption[]>;
};

function getRegionYearKey(region: string, year: string) {
  return `${region}::${year}`;
}

function resolveSplit(
  region: string,
  year: string,
  splitId: string,
  splitOptionsByRegionYear: Record<string, SplitOption[]>,
) {
  const list = splitOptionsByRegionYear[getRegionYearKey(region, year)] || [];
  if (list.length === 0) return '';
  return list.some((item) => item.id === splitId) ? splitId : list[0].id;
}

function resolveYear(year: string, yearOptions: string[]) {
  if (yearOptions.length === 0) return '';
  return yearOptions.includes(year) ? year : yearOptions[0];
}

export default function TeamsFilters({
  selectedRegion,
  selectedYear,
  selectedSplit,
  selectedSortKey,
  selectedOrder,
  regionOptions,
  yearOptions,
  splitOptionsByRegionYear,
}: Props) {
  const [region, setRegion] = useState(selectedRegion);
  const [year, setYear] = useState(selectedYear);
  const [split, setSplit] = useState(selectedSplit);

  const availableSplits = useMemo(
    () => splitOptionsByRegionYear[getRegionYearKey(region, year)] || [],
    [region, year, splitOptionsByRegionYear],
  );

  useEffect(() => {
    setRegion(selectedRegion);
    setYear(selectedYear);
    setSplit(selectedSplit);
  }, [selectedRegion, selectedYear, selectedSplit]);

  useEffect(() => {
    const safeYear = resolveYear(year, yearOptions);
    if (safeYear !== year) {
      setYear(safeYear);
      return;
    }

    const safeSplit = resolveSplit(region, safeYear, split, splitOptionsByRegionYear);
    if (safeSplit !== split) {
      setSplit(safeSplit);
    }
  }, [region, year, split, yearOptions, splitOptionsByRegionYear]);

  const onRegionChange = (nextRegion: string) => {
    const safeYear = resolveYear(year, yearOptions);
    const nextSplit = resolveSplit(nextRegion, safeYear, split, splitOptionsByRegionYear);
    setRegion(nextRegion);
    setYear(safeYear);
    setSplit(nextSplit);
  };

  const onYearChange = (nextYear: string) => {
    const safeYear = resolveYear(nextYear, yearOptions);
    const nextSplit = resolveSplit(region, safeYear, split, splitOptionsByRegionYear);
    setYear(safeYear);
    setSplit(nextSplit);
  };

  return (
    <form method="get" className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
      <input type="hidden" name="sort" value={selectedSortKey} />
      <input type="hidden" name="order" value={selectedOrder} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">选择赛区</label>
          <select
            name="region"
            value={region}
            onChange={(event) => onRegionChange(event.target.value)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900"
          >
            {regionOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">选择赛季</label>
          <select
            name="year"
            value={year}
            onChange={(event) => onYearChange(event.target.value)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900"
          >
            {yearOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">选择赛事</label>
          <select
            name="split"
            value={split}
            onChange={(event) => setSplit(event.target.value)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900"
          >
            {availableSplits.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>

        <button type="submit" className="h-[38px] px-5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-md">
          查询
        </button>
      </div>
    </form>
  );
}
