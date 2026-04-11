'use client';

import { useEffect, useMemo, useState } from 'react';

type Option = {
  value: string;
  label: string;
};

type Props = {
  selectedRegion: string;
  selectedYear: string;
  selectedTournament: string;
  selectedRole: string;
  searchText: string;
  selectedSortKey: string;
  selectedOrder: 'asc' | 'desc';
  regionOptions: Option[];
  roleOptions: Option[];
  yearsByRegion: Record<string, string[]>;
  tournamentsByRegionYear: Record<string, string[]>;
};

function buildYearKey(region: string, year: string) {
  return `${region}::${year}`;
}

function resolveYear(region: string, currentYear: string, yearsByRegion: Record<string, string[]>) {
  const years = yearsByRegion[region] || [];
  if (years.length === 0) return '';
  return years.includes(currentYear) ? currentYear : years[0];
}

function resolveTournament(region: string, year: string, currentTournament: string, tournamentsByRegionYear: Record<string, string[]>) {
  const tournaments = tournamentsByRegionYear[buildYearKey(region, year)] || [];
  if (tournaments.length === 0) return '';
  return tournaments.includes(currentTournament) ? currentTournament : tournaments[0];
}

export default function AnalysisFilters({
  selectedRegion,
  selectedYear,
  selectedTournament,
  selectedRole,
  searchText,
  selectedSortKey,
  selectedOrder,
  regionOptions,
  roleOptions,
  yearsByRegion,
  tournamentsByRegionYear,
}: Props) {
  const [region, setRegion] = useState(selectedRegion);
  const [year, setYear] = useState(selectedYear);
  const [tournament, setTournament] = useState(selectedTournament);
  const [role, setRole] = useState(selectedRole);
  const [search, setSearch] = useState(searchText);

  const availableYears = useMemo(() => yearsByRegion[region] || [], [region, yearsByRegion]);
  const availableTournaments = useMemo(() => tournamentsByRegionYear[buildYearKey(region, year)] || [], [region, year, tournamentsByRegionYear]);
  useEffect(() => {
    setRegion(selectedRegion);
    setYear(selectedYear);
    setTournament(selectedTournament);
    setRole(selectedRole);
    setSearch(searchText);
  }, [selectedRegion, selectedYear, selectedTournament, selectedRole, searchText]);

  useEffect(() => {
    const safeYear = resolveYear(region, year, yearsByRegion);
    if (safeYear !== year) {
      setYear(safeYear);
      return;
    }
    const safeTournament = resolveTournament(region, safeYear, tournament, tournamentsByRegionYear);
    if (safeTournament !== tournament) {
      setTournament(safeTournament);
    }
  }, [region, year, tournament, yearsByRegion, tournamentsByRegionYear]);

  const onRegionChange = (nextRegion: string) => {
    const nextYear = resolveYear(nextRegion, year, yearsByRegion);
    const nextTournament = resolveTournament(nextRegion, nextYear, tournament, tournamentsByRegionYear);
    setRegion(nextRegion);
    setYear(nextYear);
    setTournament(nextTournament);
  };

  const onYearChange = (nextYear: string) => {
    const safeYear = resolveYear(region, nextYear, yearsByRegion);
    const nextTournament = resolveTournament(region, safeYear, tournament, tournamentsByRegionYear);
    setYear(safeYear);
    setTournament(nextTournament);
  };

  return (
    <form method="get" className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
      <input type="hidden" name="sort" value={selectedSortKey} />
      <input type="hidden" name="order" value={selectedOrder} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5 xl:grid-cols-6 items-end">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">选择赛区</label>
          <select
            name="region"
            value={region}
            onChange={(event) => onRegionChange(event.target.value)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900"
          >
            {regionOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
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
            {availableYears.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">选择赛事</label>
          <select
            name="tournament"
            value={tournament}
            onChange={(event) => setTournament(event.target.value)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900"
          >
            {availableTournaments.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">位置筛选</label>
          <select
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900"
          >
            {roleOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
        <div className="xl:col-span-2">
          <label className="block text-xs font-bold text-slate-700 mb-1">搜索选手</label>
          <div className="flex gap-2">
            <input
              type="text"
              name="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="选手 / 战队"
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900"
            />
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-md">查询</button>
          </div>
        </div>
      </div>
    </form>
  );
}

