'use client';

import { useEffect, useMemo, useState } from 'react';

type AdminAccount = {
  id: string;
  playerId: string;
  playerName: string;
  teamShortName: string | null;
  teamName: string;
  role: string;
  gameName: string;
  tagLine: string | null;
  platform: string;
  regionGroup: string;
  puuid: string;
  summonerId: string | null;
  source: string;
  status: string;
  confidence: number;
  confidenceLabel: string;
  verificationLabel: string;
  isPrimary: boolean;
  isActiveCandidate: boolean;
  lastVerifiedAt: string | null;
  lastMatchAt: string | null;
  notes: string | null;
  updatedAt: string;
};

type CandidateAccount = {
  id: string;
  playerId: string;
  playerName: string;
  teamName: string;
  accountName: string;
  platform: string;
  status: string;
  source: string;
  confidence: number;
  confidenceLabel: string;
  verificationLabel: string;
  games7d: number;
  lastGameAt: string | null;
  currentTier: string;
  currentRank: string;
  leaguePoints: number;
};

type PlayerOption = {
  id: string;
  name: string;
  teamName: string;
  teamShortName: string | null;
  role: string;
};

type AccountsPayload = {
  summary: {
    totalAccounts: number;
    primaryAccounts: number;
    activeAccounts: number;
    suspectAccounts: number;
  };
  players: PlayerOption[];
  accounts: AdminAccount[];
};

type ProviderStatus = {
  key: string;
  label: string;
  ready: boolean;
  detail: string;
};

type ProvidersPayload = {
  statuses: ProviderStatus[];
  readyCount: number;
  totalCount: number;
  overallReady: boolean;
  sync?: {
    autoSyncEnabled: boolean;
    intervalMinutes: number;
    retryCount: number;
    retryDelaySeconds: number;
    lastSyncedAt: string | null;
    nextScheduledAt: string | null;
    pendingAccountCount: number;
    candidateCount: number;
    recentFailureCount: number;
    recentFailureCategories: string[];
    summary: string;
    historySuccessCount: number;
    historyFailureCount: number;
    latestRun?: {
      trigger: 'manual' | 'cron';
      status: 'SUCCESS' | 'FAILED';
      startedAt: string;
      finishedAt: string;
      durationMs: number;
      refreshedPlayers: number;
      failedPlayers: number;
      riotAttempted: number;
      riotSynced: number;
      autoImportedCreated: number;
      autoImportedUpdated: number;
      note: string;
      error?: string | null;
    } | null;
    history: Array<{
      id: string;
      trigger: 'manual' | 'cron';
      status: 'SUCCESS' | 'FAILED';
      startedAt: string;
      finishedAt: string;
      durationMs: number;
      refreshedPlayers: number;
      failedPlayers: number;
      riotAttempted: number;
      riotSynced: number;
      autoImportedCreated: number;
      autoImportedUpdated: number;
      note: string;
      error?: string | null;
    }>;
  };
};

type AutoImportPayload = {
  success: boolean;
  message?: string;
  autoImport?: {
    attemptedPlayers: number;
    created: number;
    updated: number;
    skipped: number;
    notFound: number;
    failed: number;
  };
};

type ImportResultItem = {
  line: number;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message: string;
};

type ImportResultPayload = {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  results: ImportResultItem[];
};

type CreateForm = {
  playerId: string;
  platform: string;
  regionGroup: string;
  gameName: string;
  tagLine: string;
  puuid: string;
  summonerId: string;
  source: string;
  status: string;
  confidence: string;
  isPrimary: boolean;
  isActiveCandidate: boolean;
  notes: string;
};

type ImportForm = {
  rawText: string;
  platform: string;
  regionGroup: string;
  source: string;
  status: string;
  confidence: string;
  overwriteExisting: boolean;
};

const STATUS_OPTIONS = ['ACTIVE', 'SUSPECT', 'INACTIVE', 'ARCHIVED'];
const SOURCE_OPTIONS = ['MANUAL', 'RIOT', 'OPGG', 'DPM', 'MIXED'];

const DEFAULT_CREATE_FORM: CreateForm = {
  playerId: '',
  platform: 'KR',
  regionGroup: 'ASIA',
  gameName: '',
  tagLine: '',
  puuid: '',
  summonerId: '',
  source: 'MANUAL',
  status: 'SUSPECT',
  confidence: '0.60',
  isPrimary: false,
  isActiveCandidate: false,
  notes: '',
};

const DEFAULT_IMPORT_FORM: ImportForm = {
  rawText: '',
  platform: 'KR',
  regionGroup: 'ASIA',
  source: 'MANUAL',
  status: 'SUSPECT',
  confidence: '0.60',
  overwriteExisting: false,
};

const IMPORT_FLOW_STEPS = [
  '先点“下载模板”，拿到当前选手清单模板。',
  '优先填写平台、游戏名、Tag、状态、可信度。',
  '首批建议先导入主账号，可信度 0.90 以上。',
  '副号或待确认账号先标记为待确认。',
  '导入完成后执行同步，再去前台检查结果。',
];

function formatDate(value: string | null | undefined) {
  if (!value) return '暂无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无记录';
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAccountName(gameName: string, tagLine?: string | null) {
  return tagLine ? `${gameName}#${tagLine}` : gameName;
}

function formatRankLabel(tier: string, rank: string, lp: number) {
  if (!tier || tier === 'UNRANKED') return '未定级';
  return `${tier}${rank ? ` ${rank}` : ''} ${lp}LP`;
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    MANUAL: '手动录入',
    RIOT: 'Riot 同步',
    OPGG: 'OP.GG',
    DPM: 'DPM',
    MIXED: '混合来源',
  };
  return labels[source] ?? source;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    ACTIVE: '已启用',
    SUSPECT: '自动补齐',
    INACTIVE: '未启用',
    ARCHIVED: '已归档',
  };
  return labels[status] ?? status;
}

function badgeClass(status: string) {
  if (status === 'ACTIVE') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'SUSPECT') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (status === 'ARCHIVED') return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
  return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
}

function sampleImportText() {
  return [
    'playerName,teamName,platform,gameName,tagLine,source,status,confidence,isPrimary,isActiveCandidate,notes',
    'Faker,T1,KR,Hide on bush,KR1,MANUAL,ACTIVE,0.95,true,true,主账号',
    'Faker,T1,KR,test acc,1234,MANUAL,SUSPECT,0.60,false,false,副号待确认',
  ].join('\n');
}

function CardTitle({ title, description, right }: { title: string; description: string; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h4 className="text-lg font-black text-white">{title}</h4>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      {right}
    </div>
  );
}

function formatRelativeSchedule(value: string | null | undefined) {
  if (!value) return '暂无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无记录';
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDurationMs(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 秒';
  if (value < 1000) return `${value} 毫秒`;
  const seconds = Math.round(value / 100) / 10;
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = Math.round((seconds % 60) * 10) / 10;
  return `${minutes} 分 ${remainSeconds} 秒`;
}

function syncTriggerLabel(value: 'manual' | 'cron') {
  return value === 'cron' ? '自动同步' : '手动同步';
}

function syncFailureCategoryLabel(value: string) {
  const labels: Record<string, string> = {
    not_found: '账号不存在',
    invalid_mapping: '映射失效',
    rate_limit: '请求限流',
    network: '网络异常',
    timeout: '请求超时',
    unknown: '未知异常',
  };
  return labels[value] ?? value;
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
      <div className="text-xs font-black tracking-[0.22em] text-slate-400">{title}</div>
      <div className="mt-3 text-4xl font-black text-white">{value}</div>
    </div>
  );
}

export default function RankManagerClient() {
  const [search, setSearch] = useState('');
  const [accountsPayload, setAccountsPayload] = useState<AccountsPayload | null>(null);
  const [providers, setProviders] = useState<ProvidersPayload | null>(null);
  const [candidates, setCandidates] = useState<CandidateAccount[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Partial<AdminAccount>>>({});
  const [createForm, setCreateForm] = useState<CreateForm>(DEFAULT_CREATE_FORM);
  const [importForm, setImportForm] = useState<ImportForm>(DEFAULT_IMPORT_FORM);
  const [importResult, setImportResult] = useState<ImportResultPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [refreshingPlayerId, setRefreshingPlayerId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [autoImporting, setAutoImporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportingHistory, setExportingHistory] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const summary = useMemo(
    () =>
      accountsPayload?.summary ?? {
        totalAccounts: 0,
        primaryAccounts: 0,
        activeAccounts: 0,
        suspectAccounts: 0,
      },
    [accountsPayload],
  );

  const accountPlayers = accountsPayload?.players ?? [];
  const accountRows = accountsPayload?.accounts ?? [];
  const providerStatuses = providers?.statuses ?? [];

  const draftValue = <K extends keyof AdminAccount>(account: AdminAccount, key: K) =>
    (drafts[account.id]?.[key] ?? account[key]) as AdminAccount[K];

  const setDraft = (accountId: string, patch: Partial<AdminAccount>) => {
    setDrafts((current) => ({
      ...current,
      [accountId]: { ...current[accountId], ...patch },
    }));
  };

  const loadData = async (keyword = search) => {
    setLoading(true);
    setError('');
    try {
      const [accountsRes, candidatesRes, providersRes] = await Promise.all([
        fetch(`/api/admin/rank/accounts?search=${encodeURIComponent(keyword)}`, { cache: 'no-store' }),
        fetch('/api/admin/rank/candidates', { cache: 'no-store' }),
        fetch('/api/admin/rank/providers', { cache: 'no-store' }),
      ]);

      const accountsJson = await accountsRes.json().catch(() => ({}));
      const candidatesJson = await candidatesRes.json().catch(() => ({}));
      const providersJson = await providersRes.json().catch(() => ({}));

      if (!accountsRes.ok) throw new Error(accountsJson.error || '加载账号映射失败');
      if (!candidatesRes.ok) throw new Error(candidatesJson.error || '加载候选账号失败');
      if (!providersRes.ok) throw new Error(providersJson.error || '加载 Provider 状态失败');

      setAccountsPayload({
        summary: {
          totalAccounts: Number(accountsJson?.summary?.totalAccounts ?? 0),
          primaryAccounts: Number(accountsJson?.summary?.primaryAccounts ?? 0),
          activeAccounts: Number(accountsJson?.summary?.activeAccounts ?? 0),
          suspectAccounts: Number(accountsJson?.summary?.suspectAccounts ?? 0),
        },
        players: Array.isArray(accountsJson?.players) ? accountsJson.players : [],
        accounts: Array.isArray(accountsJson?.accounts) ? accountsJson.accounts : [],
      });
      setCandidates(
        Array.isArray(candidatesJson)
          ? candidatesJson
          : Array.isArray(candidatesJson?.candidates)
            ? candidatesJson.candidates
            : [],
      );
      setProviders({
        statuses: Array.isArray(providersJson?.statuses) ? providersJson.statuses : [],
        readyCount: Number(providersJson?.readyCount ?? 0),
        totalCount: Number(providersJson?.totalCount ?? 0),
        overallReady: Boolean(providersJson?.overallReady),
        sync: providersJson?.sync
          ? {
              autoSyncEnabled: Boolean(providersJson.sync.autoSyncEnabled),
              intervalMinutes: Number(providersJson.sync.intervalMinutes ?? 360),
              retryCount: Number(providersJson.sync.retryCount ?? 0),
              retryDelaySeconds: Number(providersJson.sync.retryDelaySeconds ?? 20),
              lastSyncedAt: providersJson.sync.lastSyncedAt ? String(providersJson.sync.lastSyncedAt) : null,
              nextScheduledAt: providersJson.sync.nextScheduledAt ? String(providersJson.sync.nextScheduledAt) : null,
              pendingAccountCount: Number(providersJson.sync.pendingAccountCount ?? 0),
              candidateCount: Number(providersJson.sync.candidateCount ?? 0),
              recentFailureCount: Number(providersJson.sync.recentFailureCount ?? 0),
              recentFailureCategories: Array.isArray(providersJson.sync.recentFailureCategories)
                ? providersJson.sync.recentFailureCategories.map((item: unknown) => String(item))
                : [],
              summary: String(providersJson.sync.summary || ''),
              historySuccessCount: Number(providersJson.sync.historySuccessCount ?? 0),
              historyFailureCount: Number(providersJson.sync.historyFailureCount ?? 0),
              latestRun: providersJson.sync.latestRun
                ? {
                    trigger: providersJson.sync.latestRun.trigger === 'cron' ? 'cron' : 'manual',
                    status: providersJson.sync.latestRun.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
                    startedAt: String(providersJson.sync.latestRun.startedAt || ''),
                    finishedAt: String(providersJson.sync.latestRun.finishedAt || ''),
                    durationMs: Number(providersJson.sync.latestRun.durationMs ?? 0),
                    refreshedPlayers: Number(providersJson.sync.latestRun.refreshedPlayers ?? 0),
                    failedPlayers: Number(providersJson.sync.latestRun.failedPlayers ?? 0),
                    riotAttempted: Number(providersJson.sync.latestRun.riotAttempted ?? 0),
                    riotSynced: Number(providersJson.sync.latestRun.riotSynced ?? 0),
                    autoImportedCreated: Number(providersJson.sync.latestRun.autoImportedCreated ?? 0),
                    autoImportedUpdated: Number(providersJson.sync.latestRun.autoImportedUpdated ?? 0),
                    note: String(providersJson.sync.latestRun.note || ''),
                    error: providersJson.sync.latestRun.error ? String(providersJson.sync.latestRun.error) : null,
                  }
                : null,
              history: Array.isArray(providersJson.sync.history)
                ? providersJson.sync.history.map((item: any) => ({
                    id: String(item.id || ''),
                    trigger: item.trigger === 'cron' ? 'cron' : 'manual',
                    status: item.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
                    startedAt: String(item.startedAt || ''),
                    finishedAt: String(item.finishedAt || ''),
                    durationMs: Number(item.durationMs ?? 0),
                    refreshedPlayers: Number(item.refreshedPlayers ?? 0),
                    failedPlayers: Number(item.failedPlayers ?? 0),
                    riotAttempted: Number(item.riotAttempted ?? 0),
                    riotSynced: Number(item.riotSynced ?? 0),
                    autoImportedCreated: Number(item.autoImportedCreated ?? 0),
                    autoImportedUpdated: Number(item.autoImportedUpdated ?? 0),
                    note: String(item.note || ''),
                    error: item.error ? String(item.error) : null,
                  }))
                : [],
            }
          : undefined,
      });
      setDrafts({});
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载 Rank 管理页失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData('');
  }, []);

  const handleSaveAccount = async (account: AdminAccount) => {
    setSavingId(account.id);
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/admin/rank/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName: draftValue(account, 'gameName'),
          tagLine: draftValue(account, 'tagLine') || null,
          platform: draftValue(account, 'platform'),
          regionGroup: draftValue(account, 'regionGroup'),
          puuid: draftValue(account, 'puuid'),
          summonerId: draftValue(account, 'summonerId') || null,
          status: draftValue(account, 'status'),
          source: draftValue(account, 'source'),
          confidence: Number(draftValue(account, 'confidence')),
          isPrimary: Boolean(draftValue(account, 'isPrimary')),
          isActiveCandidate: Boolean(draftValue(account, 'isActiveCandidate')),
          notes: draftValue(account, 'notes') || null,
          lastVerifiedAt:
            Number(draftValue(account, 'confidence')) >= 0.85 && draftValue(account, 'status') !== 'SUSPECT'
              ? new Date().toISOString()
              : null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || '保存账号映射失败');
      setMessage(`已保存 ${account.playerName} 的账号映射。`);
      await loadData(search);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存账号映射失败');
    } finally {
      setSavingId(null);
    }
  };

  const handleRefreshPlayer = async (playerId: string) => {
    setRefreshingPlayerId(playerId);
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/admin/rank/players/${playerId}/refresh`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || '刷新选手缓存失败');
      setMessage('选手 Rank 缓存已刷新。');
      await loadData(search);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : '刷新选手缓存失败');
    } finally {
      setRefreshingPlayerId(null);
    }
  };

  const handleRunSync = async () => {
    setSyncing(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/admin/rank/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 0 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || '执行同步失败');
      setMessage(`同步完成，已刷新 ${payload.refreshedPlayers ?? 0} 名选手缓存。`);
      await loadData(search);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : '执行同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/admin/rank/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: createForm.playerId,
          platform: createForm.platform.trim().toUpperCase(),
          regionGroup: createForm.regionGroup.trim().toUpperCase(),
          gameName: createForm.gameName.trim(),
          tagLine: createForm.tagLine.trim() || undefined,
          puuid: createForm.puuid.trim() || undefined,
          summonerId: createForm.summonerId.trim() || undefined,
          source: createForm.source,
          status: createForm.status,
          confidence: Number(createForm.confidence),
          isPrimary: createForm.isPrimary,
          isActiveCandidate: createForm.isActiveCandidate,
          notes: createForm.notes.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || '创建账号映射失败');
      setCreateForm(DEFAULT_CREATE_FORM);
      setMessage('账号映射已创建。');
      await loadData(search);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建账号映射失败');
    } finally {
      setCreating(false);
    }
  };

  const handleAutoImport = async () => {
    setAutoImporting(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/admin/rank/auto-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regions: ['LPL', 'LCK'], overwriteExisting: false }),
      });
      const payload = (await response.json().catch(() => ({}))) as AutoImportPayload & { error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || '自动导入失败');
      const summary = payload.autoImport;
      setMessage(
        summary
          ? `自动导入完成：扫描 ${summary.attemptedPlayers} 名选手，新增 ${summary.created} 个账号，更新 ${summary.updated} 个账号。`
          : payload.message || '自动导入完成。',
      );
      await loadData(search);
    } catch (autoImportError) {
      setError(autoImportError instanceof Error ? autoImportError.message : '自动导入失败');
    } finally {
      setAutoImporting(false);
    }
  };

  const handleImport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setImporting(true);
    setImportResult(null);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/admin/rank/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: importForm.rawText,
          overwriteExisting: importForm.overwriteExisting,
          defaults: {
            platform: importForm.platform.trim().toUpperCase(),
            regionGroup: importForm.regionGroup.trim().toUpperCase(),
            source: importForm.source,
            status: importForm.status,
            confidence: Number(importForm.confidence),
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as ImportResultPayload & { error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || '批量导入失败');
      setImportResult(payload);
      setMessage(`导入完成：新增 ${payload.created} 条，更新 ${payload.updated} 条，跳过 ${payload.skipped} 条。`);
      await loadData(search);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '批量导入失败');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/admin/rank/import/template', { cache: 'no-store' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || '下载导入模板失败');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'rank-account-import-template.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setMessage('导入模板已下载。');
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : '下载导入模板失败');
    }
  };

  const handleCandidateAction = async (
    candidate: CandidateAccount,
    patch: Record<string, unknown>,
    successMessage: string,
  ) => {
    setSavingId(candidate.id);
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/admin/rank/accounts/${candidate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || '更新候选账号失败');
      setMessage(successMessage);
      await loadData(search);
    } catch (candidateError) {
      setError(candidateError instanceof Error ? candidateError.message : '更新候选账号失败');
    } finally {
      setSavingId(null);
    }
  };

  const handleExportSyncHistory = async () => {
    setExportingHistory(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/admin/rank/sync-history', { cache: 'no-store' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || '导出同步记录失败');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `rank-sync-history-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setMessage('最近同步记录已导出。');
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : '导出同步记录失败');
    } finally {
      setExportingHistory(false);
    }
  };

  const handleClearSyncHistory = async () => {
    setClearingHistory(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/admin/rank/sync-history', { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || '清空同步记录失败');
      setMessage('最近同步记录已清空。');
      await loadData(search);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : '清空同步记录失败');
    } finally {
      setClearingHistory(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
        <h3 className="text-xl font-black text-white">Rank 管理</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">管理选手账号映射、候选审核、批量导入、自动发现、同步和缓存刷新。</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索选手、战队或账号" className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400 xl:w-80" />
            <button type="button" onClick={() => void loadData(search)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-slate-100 transition hover:bg-white/10">刷新</button>
            <button type="button" onClick={() => void handleAutoImport()} disabled={autoImporting} className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-60">{autoImporting ? '自动导入中...' : '自动导入 LPL/LCK'}</button>
            <button type="button" onClick={() => void handleRunSync()} disabled={syncing} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-500 disabled:opacity-60">{syncing ? '执行中...' : '执行同步'}</button>
          </div>
        </div>
        {(message || error) && <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${error ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>{error || message}</div>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="账号总数" value={summary.totalAccounts} />
        <SummaryCard title="主账号" value={summary.primaryAccounts} />
        <SummaryCard title="活跃候选" value={summary.activeAccounts} />
        <SummaryCard title="自动补齐" value={summary.suspectAccounts} />
        <SummaryCard title="候选队列" value={candidates.length} />
      </div>

      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-5 py-4 text-sm text-cyan-50">
        <div className="font-black">自动导入说明</div>
        <div className="mt-2 leading-7 text-cyan-100/90">
          现在后台支持直接扫描当前库里的 <span className="font-black">LPL</span> 和 <span className="font-black">LCK</span> 选手，
          自动从职业 SoloQ 页面发现账号并写入映射，然后你再点“执行同步”即可批量回填 Riot Rank 数据，不需要逐个手工录入。
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="glass rounded-2xl border border-white/10 p-6">
            <CardTitle title="同步服务状态" description="检查外部同步依赖是否已经配置完成。" right={<div className="rounded-full bg-white/5 px-3 py-1 text-xs font-black text-slate-200">{providers ? `${providers.readyCount}/${providers.totalCount} 已就绪` : '加载中'}</div>} />
          <div className="space-y-4">
            {providers?.sync && (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="text-sm font-black text-cyan-100">自动同步状态</div>
                    <div className="mt-1 text-sm text-cyan-50/90">{providers.sync.summary}</div>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-xs font-black ${providers.sync.autoSyncEnabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
                    {providers.sync.autoSyncEnabled ? '已启用' : '未启用'}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3">
                    <div className="text-xs font-black tracking-[0.18em] text-slate-400">自动周期</div>
                    <div className="mt-2 text-base font-black text-white">每 {providers.sync.intervalMinutes} 分钟</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3">
                    <div className="text-xs font-black tracking-[0.18em] text-slate-400">失败重试</div>
                    <div className="mt-2 text-base font-black text-white">
                      最多 {providers.sync.retryCount} 次 / 间隔 {providers.sync.retryDelaySeconds} 秒
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3">
                    <div className="text-xs font-black tracking-[0.18em] text-slate-400">最近同步</div>
                    <div className="mt-2 text-base font-black text-white">{formatRelativeSchedule(providers.sync.lastSyncedAt)}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3">
                    <div className="text-xs font-black tracking-[0.18em] text-slate-400">下次预计刷新</div>
                    <div className="mt-2 text-base font-black text-white">{formatRelativeSchedule(providers.sync.nextScheduledAt)}</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3">
                    <div className="text-xs font-black tracking-[0.18em] text-slate-400">最近结果</div>
                    <div className="mt-2 text-base font-black text-white">
                      {providers.sync.latestRun
                        ? `${syncTriggerLabel(providers.sync.latestRun.trigger)} / ${
                            providers.sync.latestRun.status === 'SUCCESS' ? '成功' : '失败'
                          }`
                        : '暂无记录'}
                    </div>
                    {providers.sync.latestRun && (
                      <div className="mt-2 text-sm leading-6 text-slate-300">
                        <div>耗时：{formatDurationMs(providers.sync.latestRun.durationMs)}</div>
                        <div>
                          刷新 {providers.sync.latestRun.refreshedPlayers} / 失败 {providers.sync.latestRun.failedPlayers}
                        </div>
                        <div>
                          Riot 命中 {providers.sync.latestRun.riotSynced} / 尝试 {providers.sync.latestRun.riotAttempted}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3">
                    <div className="text-xs font-black tracking-[0.18em] text-slate-400">最近 6 次统计</div>
                    <div className="mt-2 text-base font-black text-white">
                      成功 {providers.sync.historySuccessCount} / 失败 {providers.sync.historyFailureCount}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-300">
                      {providers.sync.history.length > 0
                        ? `最近一次：${formatRelativeSchedule(providers.sync.history[0]?.finishedAt)}`
                        : '还没有同步历史记录。'}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-300">
                      近期异常账号：{providers.sync.recentFailureCount}
                      {providers.sync.recentFailureCategories.length > 0
                        ? `（${providers.sync.recentFailureCategories.map(syncFailureCategoryLabel).join(' / ')}）`
                        : ''}
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="text-xs font-black tracking-[0.18em] text-slate-400">最近同步记录</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleExportSyncHistory()}
                        disabled={exportingHistory}
                        className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-60"
                      >
                        {exportingHistory ? '导出中...' : '导出记录'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleClearSyncHistory()}
                        disabled={clearingHistory}
                        className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-black text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-60"
                      >
                        {clearingHistory ? '清理中...' : '清空记录'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-3">
                    {providers.sync.history.length === 0 && (
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-slate-400">
                        暂时还没有同步记录。
                      </div>
                    )}
                    {providers.sync.history.map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-black text-white">{syncTriggerLabel(entry.trigger)}</span>
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${
                                  entry.status === 'SUCCESS'
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                                }`}
                              >
                                {entry.status === 'SUCCESS' ? '成功' : '失败'}
                              </span>
                            </div>
                            <div className="mt-2 text-sm text-slate-300">{entry.note}</div>
                            {entry.error && <div className="mt-1 text-sm text-rose-200">错误：{entry.error}</div>}
                          </div>
                          <div className="text-sm leading-6 text-slate-300 xl:text-right">
                            <div>完成时间：{formatRelativeSchedule(entry.finishedAt)}</div>
                            <div>耗时：{formatDurationMs(entry.durationMs)}</div>
                            <div>刷新 {entry.refreshedPlayers} / 失败 {entry.failedPlayers}</div>
                            <div>Riot 命中 {entry.riotSynced} / 尝试 {entry.riotAttempted}</div>
                            <div>导入新增 {entry.autoImportedCreated} / 更新 {entry.autoImportedUpdated}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {!providers && !loading && <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-400">暂时无法读取 Provider 状态。</div>}
            {providerStatuses.map((provider) => (
              <div key={provider.key} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 px-4 py-4">
                <div>
                  <div className="text-base font-black text-white">{provider.label || provider.key}</div>
                  <div className="mt-1 text-sm text-slate-400">{provider.detail}</div>
                </div>
                <div className={`rounded-full border px-3 py-1 text-xs font-black ${provider.ready ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>{provider.ready ? '已就绪' : '未就绪'}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl border border-white/10 p-6">
          <CardTitle title="手动新增映射" description="在自动发现未覆盖到时，可先手工创建单条账号映射。" />
          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <select value={createForm.playerId} onChange={(event) => setCreateForm((current) => ({ ...current, playerId: event.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400">
                <option value="">选择选手</option>
                {accountPlayers.map((player) => <option key={player.id} value={player.id}>{player.name} / {player.teamShortName || player.teamName} / {player.role}</option>)}
              </select>
              <input value={createForm.platform} onChange={(event) => setCreateForm((current) => ({ ...current, platform: event.target.value.toUpperCase() }))} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" placeholder="平台，例如 KR" />
              <input value={createForm.regionGroup} onChange={(event) => setCreateForm((current) => ({ ...current, regionGroup: event.target.value.toUpperCase() }))} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" placeholder="区域组，例如 ASIA" />
              <input value={createForm.gameName} onChange={(event) => setCreateForm((current) => ({ ...current, gameName: event.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" placeholder="游戏名（Game Name）" />
              <input value={createForm.tagLine} onChange={(event) => setCreateForm((current) => ({ ...current, tagLine: event.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" placeholder="标签（Tag）" />
              <input value={createForm.puuid} onChange={(event) => setCreateForm((current) => ({ ...current, puuid: event.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" placeholder="PUUID（可选）" />
              <input value={createForm.summonerId} onChange={(event) => setCreateForm((current) => ({ ...current, summonerId: event.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" placeholder="Summoner ID（可选）" />
              <select value={createForm.source} onChange={(event) => setCreateForm((current) => ({ ...current, source: event.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400">{SOURCE_OPTIONS.map((source) => <option key={source} value={source}>{sourceLabel(source)}</option>)}</select>
              <select value={createForm.status} onChange={(event) => setCreateForm((current) => ({ ...current, status: event.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select>
              <input type="number" min="0" max="1" step="0.01" value={createForm.confidence} onChange={(event) => setCreateForm((current) => ({ ...current, confidence: event.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" placeholder="可信度（0-1）" />
              <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200 md:col-span-2">
                <label className="flex items-center gap-2"><input type="checkbox" checked={createForm.isPrimary} onChange={(event) => setCreateForm((current) => ({ ...current, isPrimary: event.target.checked }))} />主账号</label>
                <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={createForm.isActiveCandidate} onChange={(event) => setCreateForm((current) => ({ ...current, isActiveCandidate: event.target.checked }))} />活跃候选</label>
              </div>
            </div>
            <textarea rows={3} value={createForm.notes} onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4 text-sm text-white outline-none focus:border-blue-400" placeholder="备注 / 来源 / 校验说明" />
            <div className="flex justify-end"><button type="submit" disabled={creating} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-500 disabled:opacity-60">{creating ? '创建中...' : '创建映射'}</button></div>
          </form>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <div className="glass rounded-2xl border border-white/10 p-6">
          <CardTitle title="批量导入" description="支持 CSV、TSV 和竖线分隔文本。" right={<div className="flex flex-wrap gap-2"><button type="button" onClick={() => void handleDownloadTemplate()} className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-200 transition hover:bg-emerald-500/20">下载模板</button><button type="button" onClick={() => setImportForm((current) => ({ ...current, rawText: sampleImportText() }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-200 transition hover:bg-white/10">填入示例</button></div>} />
          <div className="mb-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <div className="text-xs font-black tracking-widest text-slate-400">导入流程</div>
            <div className="mt-3 grid gap-2">{IMPORT_FLOW_STEPS.map((step) => <div key={step} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">{step}</div>)}</div>
          </div>
          <form onSubmit={handleImport} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <input value={importForm.platform} onChange={(event) => setImportForm((current) => ({ ...current, platform: event.target.value.toUpperCase() }))} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" placeholder="默认平台" />
              <input value={importForm.regionGroup} onChange={(event) => setImportForm((current) => ({ ...current, regionGroup: event.target.value.toUpperCase() }))} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" placeholder="默认区域组" />
              <select value={importForm.source} onChange={(event) => setImportForm((current) => ({ ...current, source: event.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400">{SOURCE_OPTIONS.map((source) => <option key={source} value={source}>{sourceLabel(source)}</option>)}</select>
              <select value={importForm.status} onChange={(event) => setImportForm((current) => ({ ...current, status: event.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select>
              <input type="number" min="0" max="1" step="0.01" value={importForm.confidence} onChange={(event) => setImportForm((current) => ({ ...current, confidence: event.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" placeholder="默认可信度" />
              <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200 md:col-span-2 xl:col-span-3"><input type="checkbox" checked={importForm.overwriteExisting} onChange={(event) => setImportForm((current) => ({ ...current, overwriteExisting: event.target.checked }))} />同一选手 / 平台 / 账号已存在时，覆盖旧映射</label>
            </div>
            <textarea rows={10} value={importForm.rawText} onChange={(event) => setImportForm((current) => ({ ...current, rawText: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4 text-sm text-white outline-none focus:border-blue-400" placeholder="把账号映射文本粘贴到这里..." />
            <div className="flex justify-end"><button type="submit" disabled={importing} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-500 disabled:opacity-60">{importing ? '导入中...' : '执行导入'}</button></div>
          </form>
          {importResult && <div className="mt-5 space-y-3"><div className="grid gap-3 md:grid-cols-4"><div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">新增：{importResult.created}</div><div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">更新：{importResult.updated}</div><div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">跳过：{importResult.skipped}</div><div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">失败：{importResult.failed}</div></div><div className="custom-scrollbar max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/40 p-3">{importResult.results.map((item) => <div key={`${item.line}-${item.message}`} className={`rounded-lg border px-3 py-2 text-sm ${item.status === 'error' ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : item.status === 'created' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : item.status === 'updated' ? 'border-sky-500/30 bg-sky-500/10 text-sky-200' : 'border-white/10 bg-white/5 text-slate-300'}`}>第 {item.line} 行：{item.message}</div>)}</div></div>}
        </div>

        <div className="glass rounded-2xl border border-white/10 p-6">
          <CardTitle title="候选账号审核" description="确认、保留或归档低可信账号映射。" />
          <div className="custom-scrollbar max-h-[720px] space-y-3 overflow-y-auto pr-1">
            {!loading && candidates.length === 0 && <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-400">当前没有待审核的候选账号。</div>}
            {candidates.map((candidate) => (
              <div key={candidate.id} className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-white">{candidate.playerName} / {candidate.teamName}</div>
                    <div className="mt-1 text-sm text-slate-300">{candidate.accountName}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]"><span className={`rounded-full border px-2.5 py-1 font-black ${badgeClass(candidate.status)}`}>{statusLabel(candidate.status)}</span><span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-black text-slate-300">{candidate.confidenceLabel}</span><span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-black text-slate-300">{candidate.platform}</span></div>
                  </div>
                  <div className="text-right text-xs text-slate-400"><div>{formatRankLabel(candidate.currentTier, candidate.currentRank, candidate.leaguePoints)}</div><div className="mt-1">近 7 天：{candidate.games7d}</div><div className="mt-1">{formatDate(candidate.lastGameAt)}</div></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={savingId === candidate.id} onClick={() => void handleCandidateAction(candidate, { status: 'ACTIVE', confidence: Math.max(candidate.confidence, 0.9), lastVerifiedAt: new Date().toISOString() }, `已确认 ${candidate.accountName}。`)} className="rounded-xl bg-emerald-500/20 px-3 py-2 text-xs font-black text-emerald-200 transition hover:bg-emerald-500/30 disabled:opacity-50">确认通过</button>
                  <button type="button" disabled={savingId === candidate.id} onClick={() => void handleCandidateAction(candidate, { status: 'SUSPECT', confidence: 0.5, lastVerifiedAt: null }, `已保留 ${candidate.accountName} 为自动补齐。`)} className="rounded-xl bg-amber-500/20 px-3 py-2 text-xs font-black text-amber-200 transition hover:bg-amber-500/30 disabled:opacity-50">保留自动补齐</button>
                  <button type="button" disabled={savingId === candidate.id} onClick={() => void handleCandidateAction(candidate, { status: 'ARCHIVED' }, `已归档 ${candidate.accountName}。`)} className="rounded-xl bg-slate-500/20 px-3 py-2 text-xs font-black text-slate-200 transition hover:bg-slate-500/30 disabled:opacity-50">归档</button>
                  <button type="button" disabled={refreshingPlayerId === candidate.playerId} onClick={() => void handleRefreshPlayer(candidate.playerId)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-200 transition hover:bg-white/10 disabled:opacity-50">{refreshingPlayerId === candidate.playerId ? '刷新中...' : '刷新选手缓存'}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/10 p-6">
        <CardTitle title="映射表" description="编辑已生效的账号映射，切换主账号 / 活跃标记并刷新缓存。" right={<div className="rounded-full bg-white/5 px-3 py-1 text-xs font-black text-slate-300">{accountRows.length} 条</div>} />
        {loading && <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-400">正在加载 Rank 管理数据...</div>}
        {!loading && accountRows.length === 0 && <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-400">当前筛选条件下没有账号映射。</div>}
        {!loading && accountRows.length > 0 && (
          <div className="space-y-4">
            {accountRows.map((account) => (
              <div key={account.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="text-sm font-black text-white">{account.playerName} / {account.teamShortName || account.teamName} / {account.role}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]"><span className={`rounded-full border px-2.5 py-1 font-black ${badgeClass(String(draftValue(account, 'status')))}`}>{statusLabel(String(draftValue(account, 'status')))}</span><span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-black text-slate-300">{draftValue(account, 'confidence')} / 1.00</span><span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-black text-slate-300">{account.verificationLabel}</span></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void handleSaveAccount(account)} disabled={savingId === account.id} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-500 disabled:opacity-50">{savingId === account.id ? '保存中...' : '保存'}</button>
                    <button type="button" onClick={() => void handleRefreshPlayer(account.playerId)} disabled={refreshingPlayerId === account.playerId} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-slate-200 transition hover:bg-white/10 disabled:opacity-50">{refreshingPlayerId === account.playerId ? '刷新中...' : '刷新缓存'}</button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <input value={String(draftValue(account, 'gameName') ?? '')} onChange={(event) => setDraft(account.id, { gameName: event.target.value })} className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" placeholder="游戏名（Game Name）" />
                  <input value={String(draftValue(account, 'tagLine') ?? '')} onChange={(event) => setDraft(account.id, { tagLine: event.target.value || null })} className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" placeholder="标签（Tag）" />
                  <input value={String(draftValue(account, 'platform') ?? '')} onChange={(event) => setDraft(account.id, { platform: event.target.value.toUpperCase() })} className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" placeholder="平台" />
                  <input value={String(draftValue(account, 'regionGroup') ?? '')} onChange={(event) => setDraft(account.id, { regionGroup: event.target.value.toUpperCase() })} className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" placeholder="区域组" />
                  <input value={String(draftValue(account, 'puuid') ?? '')} onChange={(event) => setDraft(account.id, { puuid: event.target.value })} className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-xs text-slate-300 outline-none focus:border-blue-400 md:col-span-2" placeholder="PUUID" />
                  <input value={String(draftValue(account, 'summonerId') ?? '')} onChange={(event) => setDraft(account.id, { summonerId: event.target.value || null })} className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-xs text-slate-300 outline-none focus:border-blue-400 md:col-span-2" placeholder="Summoner ID" />
                  <select value={String(draftValue(account, 'status') ?? account.status)} onChange={(event) => setDraft(account.id, { status: event.target.value })} className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select>
                  <select value={String(draftValue(account, 'source') ?? account.source)} onChange={(event) => setDraft(account.id, { source: event.target.value })} className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400">{SOURCE_OPTIONS.map((source) => <option key={source} value={source}>{sourceLabel(source)}</option>)}</select>
                  <input type="number" min="0" max="1" step="0.01" value={Number(draftValue(account, 'confidence') ?? 0)} onChange={(event) => setDraft(account.id, { confidence: Number(event.target.value) })} className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" placeholder="可信度" />
                  <textarea rows={3} value={String(draftValue(account, 'notes') ?? '')} onChange={(event) => setDraft(account.id, { notes: event.target.value || null })} className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400 md:col-span-2 xl:col-span-3" placeholder="备注 / 来源 / 校验说明" />
                  <div className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-sm text-slate-200">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(draftValue(account, 'isPrimary'))} onChange={(event) => setDraft(account.id, { isPrimary: event.target.checked })} />主账号</label>
                    <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={Boolean(draftValue(account, 'isActiveCandidate'))} onChange={(event) => setDraft(account.id, { isActiveCandidate: event.target.checked })} />活跃候选</label>
                    <div className="mt-3 text-xs text-slate-400">当前展示：{formatAccountName(String(draftValue(account, 'gameName')), String(draftValue(account, 'tagLine') || ''))}</div>
                    <div className="mt-1 text-xs text-slate-400">最近校验：{formatDate(account.lastVerifiedAt)}</div>
                    <div className="mt-1 text-xs text-slate-400">最近活跃：{formatDate(account.lastMatchAt)}</div>
                    <div className="mt-1 text-xs text-slate-400">更新时间：{formatDate(account.updatedAt)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
