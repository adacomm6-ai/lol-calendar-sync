'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import ConfigEditorClient from './ConfigEditorClient';
import TeamManagerClient from './modules/teams/TeamManagerClient';
import RankManagerClient from './modules/rank/RankManagerClient';
import type { SystemConfigData } from '@/lib/config-shared';

interface Team {
  id: string;
  name: string;
  shortName: string | null;
  region: string;
  logo: string | null;
}

interface Props {
  initialConfig: SystemConfigData;
  initialTeams: Team[];
  regions: string[];
  initialTab?: string;
}

type TabType = 'general' | 'teams' | 'rank' | 'link_schedule';

const ALLOWED_TABS: TabType[] = ['general', 'teams', 'rank'];

function resolveAdminTab(
  searchTab: string | null | undefined,
  initialTab?: string,
): TabType {
  const fromSearch = searchTab as TabType | null;
  if (fromSearch && ALLOWED_TABS.includes(fromSearch)) {
    return fromSearch;
  }

  const fromInitial = initialTab as TabType | undefined;
  if (fromInitial && ALLOWED_TABS.includes(fromInitial)) {
    return fromInitial;
  }

  if (typeof window !== 'undefined') {
    const fromWindow = new URLSearchParams(window.location.search).get('tab') as TabType | null;
    if (fromWindow && ALLOWED_TABS.includes(fromWindow)) {
      return fromWindow;
    }
  }

  return 'general';
}

const tabs: Array<{
  id: TabType;
  label: string;
  icon: string;
  desc: string;
  href?: string;
}> = [
  { id: 'general', label: '配置预览', icon: '◎', desc: '系统全局配置' },
  { id: 'teams', label: '战队管理', icon: '#', desc: '全联赛战队维护' },
  { id: 'rank', label: 'Rank 管理', icon: 'R', desc: '账号映射与同步控制' },
  { id: 'link_schedule', label: '赛程管理', icon: '≣', desc: '返回赛程管理', href: '/admin/schedule' },
];

export default function AdminDashboardClient({ initialConfig, initialTeams, regions, initialTab }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const searchTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<TabType>(() => resolveAdminTab(searchTab, initialTab));

  useEffect(() => {
    setActiveTab(resolveAdminTab(searchTab, initialTab));
  }, [initialTab, searchTab]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="relative flex min-h-[calc(100vh-64px)]">
      <div className="relative z-10 hidden w-80 shrink-0 flex-col border-r border-white/5 bg-slate-950/80 pb-4 pt-8 backdrop-blur-3xl md:flex">
        <div className="mb-6 border-b border-white/5 px-8 pb-8">
          <h1 className="mb-2 flex items-center gap-2 text-2xl font-black tracking-tight text-white">
            <span className="h-6 w-1.5 rounded-full bg-blue-600" />
            超级控制台
          </h1>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Admin Control Center</p>
        </div>

        <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-4">
          <div className="mb-1 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600">系统与配置</div>
          {tabs
            .filter((tab) => !tab.id.startsWith('link_'))
            .map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`group relative flex w-full items-center gap-4 overflow-hidden rounded-xl border px-4 py-3 text-left transition-all duration-300 ${
                    isActive ? 'border-blue-500/20 bg-blue-600/10' : 'border-transparent hover:bg-white/5'
                  }`}
                >
                  {isActive && <div className="absolute left-0 top-1/2 h-1/2 w-1 -translate-y-1/2 rounded-r-full bg-blue-500" />}
                  <div className="w-5 text-center text-lg leading-none">{tab.icon}</div>
                  <div className="flex flex-col">
                    <span className={`text-[13px] font-bold tracking-wide ${isActive ? 'text-blue-400' : 'text-slate-300 group-hover:text-white'}`}>{tab.label}</span>
                    <span className="text-[10px] font-medium text-slate-500">{tab.desc}</span>
                  </div>
                </button>
              );
            })}

          <div className="mb-1 mt-6 border-t border-white/5 px-4 pb-2 pt-6 text-[10px] font-black uppercase tracking-widest text-slate-600">
            外部模块快捷入口
          </div>
          {tabs
            .filter((tab) => tab.id.startsWith('link_'))
            .map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.href) window.location.href = tab.href;
                }}
                className="group flex w-full items-center gap-4 rounded-xl border border-transparent px-4 py-3 text-left transition-all duration-300 hover:bg-white/5"
              >
                <div className="w-5 text-center text-lg leading-none">{tab.icon}</div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-bold tracking-wide text-slate-400 group-hover:text-white">{tab.label}</span>
                  <span className="text-[10px] font-medium text-slate-500">{tab.desc}</span>
                </div>
                <span className="ml-auto text-xs text-slate-600 group-hover:text-slate-400">-&gt;</span>
              </button>
            ))}
        </div>
      </div>

      <div className="relative h-[calc(100vh-64px)] flex-1 overflow-y-auto bg-slate-900/40">
        <div className="mx-auto max-w-[1800px] p-8">
          <div className="glass mb-8 flex flex-col gap-2 rounded-2xl p-6 md:hidden">
            <h1 className="flex items-center gap-3 text-2xl font-black tracking-tight text-white">
              <span className="h-6 w-1.5 rounded-full bg-blue-600" />
              管理控制台
            </h1>
            <div className="custom-scrollbar mt-4 flex gap-2 overflow-x-auto pb-2">
              {tabs
                .filter((tab) => !tab.id.startsWith('link_'))
                .map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`whitespace-nowrap rounded-lg px-4 py-2 text-[11px] font-black ${
                      activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
            </div>
          </div>

          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black uppercase tracking-wide text-white">{tabs.find((tab) => tab.id === activeTab)?.label}</h2>
              <p className="mt-1 text-sm text-slate-400">{tabs.find((tab) => tab.id === activeTab)?.desc}</p>
            </div>
          </div>

          <div className="relative z-10">
            {activeTab === 'general' && (
              <ConfigEditorClient
                key={JSON.stringify({
                  years: initialConfig.years,
                  defaultSplit: initialConfig.defaultSplit,
                  splits: initialConfig.splits,
                })}
                initialConfig={initialConfig}
              />
            )}

            {activeTab === 'teams' && (
              <TeamManagerClient initialTeams={initialTeams} regions={regions} splits={initialConfig.splits} years={initialConfig.years} />
            )}

            {activeTab === 'rank' && <RankManagerClient />}
          </div>
        </div>
      </div>
    </div>
  );
}
