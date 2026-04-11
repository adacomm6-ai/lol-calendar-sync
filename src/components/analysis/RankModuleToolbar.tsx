'use client';

import { useEffect, useMemo, useState } from 'react';

import type { RankAccountStatusOption, RankActivityOption, RankModuleSortKey } from '@/lib/player-rank';

type Option = {
  value: string;
  label: string;
};

type Props = {
  selectedRegion: string;
  selectedYear: string;
  selectedTournament: string;
  selectedRole: string;
  selectedActivity: RankActivityOption;
  selectedAccountStatus: RankAccountStatusOption;
  selectedSortKey: RankModuleSortKey;
  selectedOrder: 'asc' | 'desc';
  searchText: string;
  regionOptions: Option[];
  roleOptions: Option[];
  activityOptions: Array<{ value: RankActivityOption; label: string }>;
  accountStatusOptions: Array<{ value: RankAccountStatusOption; label: string }>;
  sortOptions: Array<{ value: RankModuleSortKey; label: string }>;
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

export default function RankModuleToolbar({
  selectedRegion,
  selectedYear,
  selectedTournament,
  selectedRole,
  selectedActivity,
  selectedAccountStatus,
  selectedSortKey,
  selectedOrder,
  searchText,
  regionOptions,
  roleOptions,
  activityOptions,
  accountStatusOptions,
  sortOptions,
  yearsByRegion,
  tournamentsByRegionYear,
}: Props) {
  const [region, setRegion] = useState(selectedRegion);
  const [year, setYear] = useState(selectedYear);
  const [tournament, setTournament] = useState(selectedTournament);
  const [role, setRole] = useState(selectedRole);
  const [activity, setActivity] = useState(selectedActivity);
  const [accountStatus, setAccountStatus] = useState(selectedAccountStatus);
  const [rankSort, setRankSort] = useState(selectedSortKey);
  const [rankOrder, setRankOrder] = useState(selectedOrder);
  const [search, setSearch] = useState(searchText);

  useEffect(() => {
    setRegion(selectedRegion);
    setYear(selectedYear);
    setTournament(selectedTournament);
    setRole(selectedRole);
    setActivity(selectedActivity);
    setAccountStatus(selectedAccountStatus);
    setRankSort(selectedSortKey);
    setRankOrder(selectedOrder);
    setSearch(searchText);
  }, [
    selectedRegion,
    selectedYear,
    selectedTournament,
    selectedRole,
    selectedActivity,
    selectedAccountStatus,
    selectedSortKey,
    selectedOrder,
    searchText,
  ]);

  const availableYears = useMemo(() => yearsByRegion[region] || [], [region, yearsByRegion]);
  const availableTournaments = useMemo(
    () => tournamentsByRegionYear[buildYearKey(region, year)] || [],
    [region, year, tournamentsByRegionYear],
  );

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
    <form method="get" className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
      <input type="hidden" name="view" value="rank" />

      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700">赛区</label>
          <select
            name="region"
            value={region}
            onChange={(event) => onRegionChange(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          >
            {regionOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700">赛季</label>
          <select
            name="year"
            value={year}
            onChange={(event) => onYearChange(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          >
            {availableYears.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700">赛事</label>
          <select
            name="tournament"
            value={tournament}
            onChange={(event) => setTournament(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          >
            {availableTournaments.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700">位置</label>
          <select
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          >
            {roleOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700">活跃度</label>
          <select
            name="activity"
            value={activity}
            onChange={(event) => setActivity(event.target.value as RankActivityOption)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          >
            {activityOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700">账号状态</label>
          <select
            name="accountStatus"
            value={accountStatus}
            onChange={(event) => setAccountStatus(event.target.value as RankAccountStatusOption)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          >
            {accountStatusOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700">排序</label>
          <div className="flex gap-2">
            <select
              name="rankSort"
              value={rankSort}
              onChange={(event) => setRankSort(event.target.value as RankModuleSortKey)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              {sortOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <select
              name="rankOrder"
              value={rankOrder}
              onChange={(event) => setRankOrder(event.target.value as 'asc' | 'desc')}
              className="w-[96px] rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700">搜索</label>
          <div className="flex gap-2">
            <input
              type="text"
              name="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="选手 / 战队"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500">
              查询
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
