const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);

const absoluteDbPath = path.join(projectRoot, '..', '..', 'prisma', 'dev.db').replace(/\\/g, '/');
process.env.APP_DB_TARGET = 'local';
process.env.DATABASE_URL = `file:${absoluteDbPath}`;

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const AUDIT_CROSS_TEAM = process.argv.includes('--audit-cross-team');
const LOG_DIR = path.join(projectRoot, 'logs');
const SUMMARY_PATH = path.join(LOG_DIR, 'cleanup-local-player-registry-summary.json');
const REMAINING_PATH = path.join(LOG_DIR, 'cleanup-local-player-registry-remaining.json');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeNameKey(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '');
}

function isSampleSplit(value) {
  return normalizeText(value).includes('本地样本');
}

function isPlaceholderPlayerName(value) {
  const raw = normalizeText(value);
  if (!raw) return true;
  if (/^[A-Za-z]\d{1,2}$/.test(raw)) return true;
  if (raw.includes('候选')) return true;
  return false;
}

function normalizeRole(value) {
  const raw = normalizeText(value).toUpperCase();
  if (!raw) return 'OTHER';
  if (['TOP', '涓婂崟'].includes(raw)) return 'TOP';
  if (['JUN', 'JUNGLE', 'JG', '鎵撻噹'].includes(raw)) return 'JUN';
  if (['MID', '涓崟'].includes(raw)) return 'MID';
  if (['ADC', 'BOT', '涓嬭矾'].includes(raw)) return 'ADC';
  if (['SUP', 'SUPPORT', '杈呭姪'].includes(raw)) return 'SUP';
  return raw;
}

function normalizeAliasKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

const TEAM_ALIAS_BY_KEY = {
  drx: 'KRX',
  krx: 'KRX',
  kiwoomdrx: 'KRX',
  kiwoomdrxchallengers: 'KRX Challengers',
  gz: 'Ground Zero Gaming',
  gzg: 'Ground Zero Gaming',
  groundzerogaming: 'Ground Zero Gaming',
  gam: 'GAM Esports',
  gamesports: 'GAM Esports',
  fly: 'FlyQuest',
  flyquest: 'FlyQuest',
  dig: 'Dignitas',
  dignitas: 'Dignitas',
  shft: 'Shifters',
  shifters: 'Shifters',
  tsw: 'Team Secret Whales',
  teamsecretwhales: 'Team Secret Whales',
  sr: 'Shopify Rebellion',
  shopifyrebellion: 'Shopify Rebellion',
  rg: 'Rising Gaming',
  risinggaming: 'Rising Gaming',
  nm: 'New Meta',
  newmeta: 'New Meta',
  yyg: 'Yang Yang Gaming',
  yangyanggaming: 'Yang Yang Gaming',
  uep: 'UEC eSports PlusPlus',
  uecesportsplusplus: 'UEC eSports PlusPlus',
  rvx: 'Revolution Victory X',
  revolutionvictoryx: 'Revolution Victory X',
  ve: 'V3 Esports',
  v3esports: 'V3 Esports',
  los: 'LØS',
  løs: 'LØS',
  nhe: 'Ngựa Hí Esports',
  nguahiesports: 'Ngựa Hí Esports',
  tes: 'Top Esports',
  tope: 'Top Esports',
  topesports: 'Top Esports',
  ig: 'Invictus Gaming',
  invictus: 'Invictus Gaming',
  invictusgaming: 'Invictus Gaming',
  al: "Anyone's Legend",
  anyoneslegend: "Anyone's Legend",
  wbg: 'Weibo Gaming',
  weibogaming: 'Weibo Gaming',
  blg: 'Bilibili Gaming',
  bilibiligaming: 'Bilibili Gaming',
  nip: 'Ninjas in Pyjamas',
  ninjasinpyjamas: 'Ninjas in Pyjamas',
  lng: 'LNG Esports',
  lngesports: 'LNG Esports',
  we: 'Team WE',
  teamwe: 'Team WE',
  jdg: 'JD Gaming',
  jdgaming: 'JD Gaming',
  edg: 'EDward Gaming',
  edwardgaming: 'EDward Gaming',
  fpx: 'FunPlus Phoenix',
  funplusphoenix: 'FunPlus Phoenix',
  omg: 'Oh My God',
  ohmygod: 'Oh My God',
  up: 'Ultra Prime',
  ultraprime: 'Ultra Prime',
  tt: 'ThunderTalk Gaming',
  thundertalkgaming: 'ThunderTalk Gaming',
  lgd: 'LGD Gaming',
  lgdgaming: 'LGD Gaming',
  vit: 'Team Vitality',
  teamvitality: 'Team Vitality',
  tv: 'Team Vitality',
  kc: 'Karmine Corp',
  karminecorp: 'Karmine Corp',
  mkoi: 'Movistar KOI',
  movistarkoi: 'Movistar KOI',
  gx: 'GIANTX',
  giantx: 'GIANTX',
  th: 'Team Heretics',
  heretics: 'Team Heretics',
  teamheretics: 'Team Heretics',
  fnc: 'Fnatic',
  fnatic: 'Fnatic',
  g2: 'G2 Esports',
  g2esports: 'G2 Esports',
  bds: 'Team BDS',
  teambds: 'Team BDS',
  rge: 'Rogue',
  rogue: 'Rogue',
  navi: 'Natus Vincere',
  natusvincere: 'Natus Vincere',
  nv: 'Natus Vincere',
  sk: 'SK Gaming',
  skgaming: 'SK Gaming',
  gen: 'GEN',
  geng: 'GEN',
  gengesports: 'GEN',
  kt: 'KT',
  ktrolster: 'KT',
  dk: 'DK',
  dpluskia: 'DK',
  ns: 'NS',
  nongshimredforce: 'NS',
  bro: 'BRO',
  oksavingsbankbrion: 'BRO',
  hanjinbrion: 'BRO',
  bfx: 'BFX',
  bnkfearx: 'BFX',
  hle: 'Hanwha Life Esports',
  hanwhalifeesports: 'Hanwha Life Esports',
  tl: 'Team Liquid',
  teamliquid: 'Team Liquid',
  tlaw: 'Team Liquid',
  lll: 'LOUD',
  loud: 'LOUD',
  png: 'paiN Gaming',
  paingaming: 'paiN Gaming',
  pain: 'paiN Gaming',
  shg: 'Fukuoka SoftBank HAWKS gaming',
  fukuokasoftbankhawksgaming: 'Fukuoka SoftBank HAWKS gaming',
  dcg: 'Deep Cross Gaming',
  deepcrossgaming: 'Deep Cross Gaming',
  dsg: 'Disguised',
  disguised: 'Disguised',
  c9: 'Cloud9',
  cloud9: 'Cloud9',
  sen: 'Sentinels',
  sentinels: 'Sentinels',
  mvk: 'MVK Esports',
  mvke: 'MVK Esports Academy',
  mvkesports: 'MVK Esports',
  mvkesportsacademy: 'MVK Esports Academy',
  leviatan: 'Leviatan',
  lev: 'Leviatan',
  fur: 'FURIA',
  furia: 'FURIA',
  red: 'RED Canids',
  redcanids: 'RED Canids',
  fx: 'Fluxo W7M',
  fx7m: 'Fluxo W7M',
  fluxow7m: 'Fluxo W7M',
  dfm: 'DetonatioN FocusMe',
  detonationfocusme: 'DetonatioN FocusMe',
  cfo: 'CTBC Flying Oyster',
  ctbcflyingoyster: 'CTBC Flying Oyster',
  vks: 'Vivo Keyd Stars',
  vivokeydstars: 'Vivo Keyd Stars',
  naviacademy: 'NAVI',
};

function resolveTeamAlias(value) {
  const trimmed = normalizeText(value);
  if (!trimmed) return '';
  return TEAM_ALIAS_BY_KEY[normalizeAliasKey(trimmed)] || trimmed;
}

function normalizeTeamLookupKey(value) {
  return normalizeAliasKey(resolveTeamAlias(value));
}

function buildTeamAcronym(value) {
  const tokens = String(value || '')
    .trim()
    .split(/[\s/._-]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !['team', 'esports', 'gaming', 'club'].includes(token.toLowerCase()));
  if (tokens.length <= 1) return '';
  return normalizeAliasKey(tokens.map((token) => token[0]).join(''));
}

function normalizeTeamIdentityKey(name, shortName) {
  const canonicalName = normalizeTeamLookupKey(name);
  const canonicalShort = normalizeTeamLookupKey(shortName);
  if (!canonicalName) return canonicalShort;
  if (!canonicalShort) return canonicalName;

  const acronym = buildTeamAcronym(resolveTeamAlias(name));
  if (acronym && acronym === normalizeAliasKey(shortName)) {
    return canonicalName;
  }

  return canonicalName;
}

function getSnapshotCanonicalTeamKey(snapshot) {
  return normalizeTeamIdentityKey(snapshot.teamName || '', snapshot.teamShortName || '');
}

const TEAM_FAMILY_BY_KEY = {
  kt: 'kt-family',
  ktrolsterchallengers: 'kt-family',
  krx: 'krx-family',
  krxchallengers: 'krx-family',
  mvkesports: 'mvk-family',
  mvkesportsacademy: 'mvk-family',
};

function normalizeTeamFamilyKey(name, shortName) {
  const identityKey = normalizeTeamIdentityKey(name, shortName);
  return TEAM_FAMILY_BY_KEY[identityKey] || identityKey;
}

function mergeSplitValues(values) {
  const seen = new Set();
  const parts = [];
  values.forEach((value) => {
    String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        const key = item.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        parts.push(item);
      });
  });
  return parts.join(', ');
}

function chooseKeeper(entries) {
  return entries
    .slice()
    .sort((left, right) => {
      const leftScore = left.refScore * 100 + (left.photo ? 10 : 0) + left.snapshotRefs * 5;
      const rightScore = right.refScore * 100 + (right.photo ? 10 : 0) + right.snapshotRefs * 5;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
    })[0];
}

async function loadState() {
  const [players, snapshots, teams] = await Promise.all([
    prisma.player.findMany({
      include: {
        team: true,
        statSnapshots: { select: { id: true, teamName: true, teamShortName: true } },
        rankAccounts: { select: { id: true } },
        rankSnapshots: { select: { id: true } },
        rankRecentSummaries: { select: { id: true } },
        rankProfileCache: { select: { id: true } },
      },
    }),
    prisma.playerStatSnapshot.findMany({
      select: {
        id: true,
        playerId: true,
        normalizedPlayerName: true,
        playerName: true,
        role: true,
        teamName: true,
        teamShortName: true,
      },
    }),
    prisma.team.findMany({ select: { id: true, name: true, shortName: true, region: true } }),
  ]);

  const playerEntries = players.map((player) => {
    const snapshotTeamKeys = new Set(
      player.statSnapshots
        .map((snapshot) => getSnapshotCanonicalTeamKey(snapshot))
        .filter(Boolean),
    );
    return {
      id: player.id,
      name: player.name,
      normalizedName: normalizeNameKey(player.name),
      role: normalizeRole(player.role),
      split: player.split,
      photo: normalizeText(player.photo) || null,
      teamId: player.teamId,
      teamName: player.team?.name || '',
      teamShortName: player.team?.shortName || null,
      canonicalTeamKey: normalizeTeamIdentityKey(player.team?.name || '', player.team?.shortName || ''),
      region: player.team?.region || '',
      snapshotRefs: player.statSnapshots.length,
      snapshotTeamKeys: Array.from(snapshotTeamKeys),
      rankRefs:
        player.rankAccounts.length +
        player.rankSnapshots.length +
        player.rankRecentSummaries.length +
        (player.rankProfileCache ? 1 : 0),
      refScore:
        player.statSnapshots.length +
        player.rankAccounts.length +
        player.rankSnapshots.length +
        player.rankRecentSummaries.length +
        (player.rankProfileCache ? 1 : 0),
      updatedAt: player.updatedAt,
    };
  });

  const snapshotByNameRole = new Map();
  const snapshotByName = new Map();
  snapshots.forEach((snapshot) => {
    const key = `${snapshot.normalizedPlayerName}::${normalizeRole(snapshot.role)}`;
    const list = snapshotByNameRole.get(key) || [];
    list.push(snapshot);
    snapshotByNameRole.set(key, list);

    const anyRoleList = snapshotByName.get(snapshot.normalizedPlayerName) || [];
    anyRoleList.push(snapshot);
    snapshotByName.set(snapshot.normalizedPlayerName, anyRoleList);
  });

  const teamByCanonicalKey = new Map();
  teams.forEach((team) => {
    const key = normalizeTeamIdentityKey(team.name || '', team.shortName || '');
    const list = teamByCanonicalKey.get(key) || [];
    list.push(team);
    teamByCanonicalKey.set(key, list);
  });

  return { playerEntries, snapshotByNameRole, snapshotByName, teamByCanonicalKey };
}

async function mergeDuplicatePlayers(summary) {
  const { playerEntries } = await loadState();
  const groups = new Map();
  playerEntries.forEach((entry) => {
    const key = `${entry.normalizedName}::${entry.role}::${entry.canonicalTeamKey}`;
    const list = groups.get(key) || [];
    list.push(entry);
    groups.set(key, list);
  });

  const duplicateGroups = [...groups.entries()].filter(([, list]) => list.length > 1);
  summary.mergeCandidateGroups = duplicateGroups.length;

  if (!APPLY || duplicateGroups.length === 0) {
    summary.mergePlan = duplicateGroups.slice(0, 80).map(([key, list]) => ({
      key,
      members: list.map((item) => ({
        id: item.id,
        team: item.teamName,
        role: item.role,
        photo: Boolean(item.photo),
        refScore: item.refScore,
      })),
    }));
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const [, list] of duplicateGroups) {
      const keeper = chooseKeeper(list);
      const duplicates = list.filter((item) => item.id !== keeper.id);
      if (duplicates.length === 0) continue;

      const duplicateIds = duplicates.map((item) => item.id);
      const bestPhoto = [keeper.photo, ...duplicates.map((item) => item.photo)].find(Boolean) || null;
      const bestSplit = mergeSplitValues([keeper.split, ...duplicates.map((item) => item.split)]);

      await tx.player.update({
        where: { id: keeper.id },
        data: {
          photo: bestPhoto || undefined,
          split: bestSplit || keeper.split,
        },
      });

      summary.updatedSnapshotRefs += (
        await tx.playerStatSnapshot.updateMany({
          where: { playerId: { in: duplicateIds } },
          data: { playerId: keeper.id, updatedAt: new Date() },
        })
      ).count;

      summary.updatedRankAccountRefs += (
        await tx.playerRankAccount.updateMany({
          where: { playerId: { in: duplicateIds } },
          data: { playerId: keeper.id, updatedAt: new Date() },
        })
      ).count;

      summary.updatedRankSnapshotRefs += (
        await tx.playerRankSnapshot.updateMany({
          where: { playerId: { in: duplicateIds } },
          data: { playerId: keeper.id },
        })
      ).count;

      summary.updatedRecentRefs += (
        await tx.playerRankRecentSummary.updateMany({
          where: { playerId: { in: duplicateIds } },
          data: { playerId: keeper.id, updatedAt: new Date() },
        })
      ).count;

      const keeperCache = await tx.playerRankProfileCache.findFirst({ where: { playerId: keeper.id }, select: { id: true } });
      const duplicateCaches = await tx.playerRankProfileCache.findMany({
        where: { playerId: { in: duplicateIds } },
        select: { id: true, playerId: true, confidenceScore: true, updatedAt: true },
      });

      if (!keeperCache && duplicateCaches.length > 0) {
        const promoted = duplicateCaches
          .slice()
          .sort((left, right) => Number(right.confidenceScore || 0) - Number(left.confidenceScore || 0) || new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))[0];
        summary.updatedProfileRefs += (
          await tx.playerRankProfileCache.updateMany({
            where: { id: promoted.id },
            data: { playerId: keeper.id, updatedAt: new Date() },
          })
        ).count;
      }

      const duplicateCacheIds = duplicateCaches.map((item) => item.id);
      if (duplicateCacheIds.length > 0) {
        await tx.playerRankProfileCache.deleteMany({
          where: { id: { in: duplicateCacheIds }, playerId: { not: keeper.id } },
        });
      }

      summary.deletedDuplicatePlayers += (
        await tx.player.deleteMany({
          where: { id: { in: duplicateIds } },
        })
      ).count;
    }
  });
}

async function mergeFamilyPlayers(summary) {
  const { playerEntries } = await loadState();
  const groups = new Map();
  playerEntries.forEach((entry) => {
    const familyKey = normalizeTeamFamilyKey(entry.teamName, entry.teamShortName || '');
    const key = `${entry.normalizedName}::${entry.role}::${familyKey}`;
    const list = groups.get(key) || [];
    list.push(entry);
    groups.set(key, list);
  });

  const duplicateGroups = [...groups.entries()].filter(([, list]) => {
    if (list.length <= 1) return false;
    const teamKeys = new Set(list.map((item) => item.canonicalTeamKey));
    return teamKeys.size > 1;
  });
  summary.familyMergeCandidateGroups = duplicateGroups.length;

  if (!APPLY || duplicateGroups.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const [, list] of duplicateGroups) {
      const keeper = chooseKeeper(list);
      const duplicates = list.filter((item) => item.id !== keeper.id);
      if (duplicates.length === 0) continue;

      const duplicateIds = duplicates.map((item) => item.id);
      const bestPhoto = [keeper.photo, ...duplicates.map((item) => item.photo)].find(Boolean) || null;
      const bestSplit = mergeSplitValues([keeper.split, ...duplicates.map((item) => item.split)]);

      await tx.player.update({
        where: { id: keeper.id },
        data: {
          photo: bestPhoto || undefined,
          split: bestSplit || keeper.split,
        },
      });

      summary.updatedSnapshotRefs += (
        await tx.playerStatSnapshot.updateMany({
          where: { playerId: { in: duplicateIds } },
          data: { playerId: keeper.id, updatedAt: new Date() },
        })
      ).count;

      summary.updatedRankAccountRefs += (
        await tx.playerRankAccount.updateMany({
          where: { playerId: { in: duplicateIds } },
          data: { playerId: keeper.id, updatedAt: new Date() },
        })
      ).count;

      summary.updatedRankSnapshotRefs += (
        await tx.playerRankSnapshot.updateMany({
          where: { playerId: { in: duplicateIds } },
          data: { playerId: keeper.id },
        })
      ).count;

      summary.updatedRecentRefs += (
        await tx.playerRankRecentSummary.updateMany({
          where: { playerId: { in: duplicateIds } },
          data: { playerId: keeper.id, updatedAt: new Date() },
        })
      ).count;

      const keeperCache = await tx.playerRankProfileCache.findFirst({ where: { playerId: keeper.id }, select: { id: true } });
      const duplicateCaches = await tx.playerRankProfileCache.findMany({
        where: { playerId: { in: duplicateIds } },
        select: { id: true, playerId: true, confidenceScore: true, updatedAt: true },
      });

      if (!keeperCache && duplicateCaches.length > 0) {
        const promoted = duplicateCaches
          .slice()
          .sort((left, right) => Number(right.confidenceScore || 0) - Number(left.confidenceScore || 0) || new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))[0];
        summary.updatedProfileRefs += (
          await tx.playerRankProfileCache.updateMany({
            where: { id: promoted.id },
            data: { playerId: keeper.id, updatedAt: new Date() },
          })
        ).count;
      }

      const duplicateCacheIds = duplicateCaches.map((item) => item.id);
      if (duplicateCacheIds.length > 0) {
        await tx.playerRankProfileCache.deleteMany({
          where: { id: { in: duplicateCacheIds }, playerId: { not: keeper.id } },
        });
      }

      summary.deletedFamilyMergedPlayers += (
        await tx.player.deleteMany({
          where: { id: { in: duplicateIds } },
        })
      ).count;
    }
  });
}

async function rehomeMismatchedPlayers(summary) {
  const { playerEntries, teamByCanonicalKey } = await loadState();
  const candidates = playerEntries.filter((entry) => {
    if (entry.snapshotRefs === 0) return false;
    if (entry.snapshotTeamKeys.length !== 1) return false;
    return entry.snapshotTeamKeys[0] && entry.snapshotTeamKeys[0] !== entry.canonicalTeamKey;
  });

  summary.rehomeCandidateCount = candidates.length;
  if (!APPLY || candidates.length === 0) return;

  for (const entry of candidates) {
    const targetKey = entry.snapshotTeamKeys[0];
    const targetTeams = teamByCanonicalKey.get(targetKey) || [];
    const targetTeam = targetTeams[0] || null;
    if (!targetTeam) continue;

    const conflicting = await prisma.player.findMany({
      where: {
        name: entry.name,
        id: { not: entry.id },
        teamId: targetTeam.id,
      },
      select: { id: true },
    });
    if (conflicting.length > 0) continue;

    await prisma.player.update({
      where: { id: entry.id },
      data: { teamId: targetTeam.id },
    });
    summary.rehomedPlayers += 1;
  }
}

async function fillMissingPhotos(summary) {
  const { playerEntries } = await loadState();
  const groups = new Map();
  playerEntries.forEach((entry) => {
    const key = `${entry.normalizedName}::${entry.role}`;
    const list = groups.get(key) || [];
    list.push(entry);
    groups.set(key, list);
  });

  const updates = [];
  groups.forEach((list) => {
    list
      .filter((entry) => !entry.photo)
      .forEach((entry) => {
        const sameTeamPhotos = [...new Set(list.filter((item) => item.canonicalTeamKey === entry.canonicalTeamKey).map((item) => item.photo).filter(Boolean))];
        const globalPhotos = [...new Set(list.map((item) => item.photo).filter(Boolean))];
        const chosen = sameTeamPhotos.length === 1 ? sameTeamPhotos[0] : globalPhotos.length === 1 ? globalPhotos[0] : null;
        if (chosen) {
          updates.push({ id: entry.id, photo: chosen });
        }
      });
  });

  summary.photoFillCandidateCount = updates.length;
  if (!APPLY || updates.length === 0) return;

  for (const update of updates) {
    await prisma.player.update({
      where: { id: update.id },
      data: { photo: update.photo },
    });
    summary.filledPhotos += 1;
  }
}

async function deleteShellPlayers(summary) {
  const { playerEntries, snapshotByNameRole, snapshotByName } = await loadState();
  const groups = new Map();
  playerEntries.forEach((entry) => {
    const key = `${entry.normalizedName}::${entry.role}`;
    const list = groups.get(key) || [];
    list.push(entry);
    groups.set(key, list);
  });

  const deleteIds = [];
  groups.forEach((list, key) => {
    const snapshots = snapshotByNameRole.get(key) || [];
    const snapshotTeamKeys = new Set(
      snapshots.map((item) => getSnapshotCanonicalTeamKey(item)).filter(Boolean),
    );
    const meaningfulByCanonical = new Set(
      list
        .filter((entry) => entry.snapshotRefs > 0 || entry.rankRefs > 0 || Boolean(entry.photo))
        .map((entry) => entry.canonicalTeamKey)
        .filter(Boolean),
    );

    list.forEach((entry) => {
      const isShell = entry.snapshotRefs === 0 && entry.rankRefs === 0 && !entry.photo;
      if (!isShell) return;
      if (snapshotTeamKeys.size === 0) return;

      const sameCanonicalHasKeeper = meaningfulByCanonical.has(entry.canonicalTeamKey);
      const canonicalMissingFromSnapshots = !snapshotTeamKeys.has(entry.canonicalTeamKey);

      if (sameCanonicalHasKeeper || canonicalMissingFromSnapshots) {
        deleteIds.push(entry.id);
      }
    });
  });

  summary.shellDeleteCandidateCount = deleteIds.length;
  if (!APPLY || deleteIds.length === 0) return;

  summary.deletedShellPlayers += (
    await prisma.player.deleteMany({
      where: { id: { in: deleteIds } },
    })
  ).count;
}

async function deleteForeignZeroRefPlayers(summary) {
  const { playerEntries, snapshotByNameRole, snapshotByName } = await loadState();
  const deleteIds = [];

  playerEntries.forEach((entry) => {
    if (entry.refScore !== 0) return;

    const exactKey = `${entry.normalizedName}::${entry.role}`;
    const exactSnapshots = snapshotByNameRole.get(exactKey) || [];
    const exactTeamKeys = new Set(exactSnapshots.map((item) => getSnapshotCanonicalTeamKey(item)).filter(Boolean));

    if (exactSnapshots.length > 0) {
      if (!exactTeamKeys.has(entry.canonicalTeamKey)) {
        deleteIds.push(entry.id);
      }
      return;
    }

    const anyNameSnapshots = snapshotByName.get(entry.normalizedName) || [];
    if (anyNameSnapshots.length === 0) return;

    const anyRoles = new Set(anyNameSnapshots.map((item) => normalizeRole(item.role)).filter(Boolean));
    const anyTeamKeys = new Set(anyNameSnapshots.map((item) => getSnapshotCanonicalTeamKey(item)).filter(Boolean));

    if (anyRoles.size === 1 || !anyTeamKeys.has(entry.canonicalTeamKey)) {
      deleteIds.push(entry.id);
    }
  });

  const uniqueDeleteIds = [...new Set(deleteIds)];
  summary.foreignZeroRefDeleteCandidateCount = uniqueDeleteIds.length;
  if (!APPLY || uniqueDeleteIds.length === 0) return;

  summary.deletedForeignZeroRefPlayers += (
    await prisma.player.deleteMany({
      where: { id: { in: uniqueDeleteIds } },
    })
  ).count;
}

async function deleteSampleZeroRefPlayers(summary) {
  const { playerEntries } = await loadState();
  const deleteIds = playerEntries
    .filter((entry) =>
      entry.refScore === 0 &&
      !entry.photo &&
      (isSampleSplit(entry.split) || isPlaceholderPlayerName(entry.name)),
    )
    .map((entry) => entry.id);

  summary.sampleZeroRefDeleteCandidateCount = deleteIds.length;
  if (!APPLY || deleteIds.length === 0) return;

  summary.deletedSampleZeroRefPlayers += (
    await prisma.player.deleteMany({
      where: { id: { in: deleteIds } },
    })
  ).count;
}

async function absorbWeakReferencedPlayers(summary) {
  const { playerEntries } = await loadState();
  const groups = new Map();
  playerEntries.forEach((entry) => {
    const key = `${entry.normalizedName}::${entry.role}`;
    const list = groups.get(key) || [];
    list.push(entry);
    groups.set(key, list);
  });

  const plans = [];
  groups.forEach((list) => {
    const snapshotBacked = list
      .filter((entry) => entry.snapshotRefs > 0)
      .slice()
      .sort((left, right) => chooseKeeper([left, right]).id === left.id ? -1 : 1);
    if (snapshotBacked.length === 0) return;

    const keeper = chooseKeeper(snapshotBacked);
    const weakEntries = list.filter((entry) =>
      entry.id !== keeper.id &&
      entry.snapshotRefs === 0 &&
      entry.rankRefs > 0 &&
      entry.rankRefs <= 40
    );

    weakEntries.forEach((entry) => {
      plans.push({ keeper, entry });
    });
  });

  summary.weakReferencedShadowCandidateCount = plans.length;
  if (!APPLY || plans.length === 0) return;

  for (const { keeper, entry } of plans) {
    summary.updatedRankAccountRefs += (
      await prisma.playerRankAccount.updateMany({
        where: { playerId: entry.id },
        data: { playerId: keeper.id, updatedAt: new Date() },
      })
    ).count;

    summary.updatedRankSnapshotRefs += (
      await prisma.playerRankSnapshot.updateMany({
        where: { playerId: entry.id },
        data: { playerId: keeper.id },
      })
    ).count;

    summary.updatedRecentRefs += (
      await prisma.playerRankRecentSummary.updateMany({
        where: { playerId: entry.id },
        data: { playerId: keeper.id, updatedAt: new Date() },
      })
    ).count;

    const keeperCache = await prisma.playerRankProfileCache.findFirst({
      where: { playerId: keeper.id },
      select: { id: true },
    });
    const entryCache = await prisma.playerRankProfileCache.findFirst({
      where: { playerId: entry.id },
      select: { id: true },
    });

    if (entryCache) {
      if (!keeperCache) {
        summary.updatedProfileRefs += (
          await prisma.playerRankProfileCache.updateMany({
            where: { id: entryCache.id },
            data: { playerId: keeper.id, updatedAt: new Date() },
          })
        ).count;
      } else {
        await prisma.playerRankProfileCache.deleteMany({ where: { id: entryCache.id } });
      }
    }

    summary.absorbedWeakReferencedPlayers += (
      await prisma.player.deleteMany({
        where: { id: entry.id },
      })
    ).count;
  }
}

async function auditCrossTeamReferencedDuplicates(summary) {
  const { playerEntries } = await loadState();
  const groups = new Map();
  playerEntries.forEach((entry) => {
    const key = `${entry.normalizedName}::${entry.role}`;
    const list = groups.get(key) || [];
    list.push(entry);
    groups.set(key, list);
  });

  const riskyGroups = [];
  groups.forEach((list, key) => {
    const referenced = list.filter((entry) => entry.refScore > 0);
    if (referenced.length <= 1) return;
    const canonicalTeams = [...new Set(referenced.map((entry) => entry.canonicalTeamKey).filter(Boolean))];
    if (canonicalTeams.length <= 1) return;
    riskyGroups.push({
      key,
      members: referenced
        .slice()
        .sort((left, right) => right.refScore - left.refScore || left.teamName.localeCompare(right.teamName))
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          role: entry.role,
          teamName: entry.teamName,
          canonicalTeamKey: entry.canonicalTeamKey,
          region: entry.region,
          snapshotRefs: entry.snapshotRefs,
          rankRefs: entry.rankRefs,
          refScore: entry.refScore,
          photo: Boolean(entry.photo),
          snapshotTeamKeys: entry.snapshotTeamKeys,
        })),
    });
  });

  riskyGroups.sort((left, right) => right.members.length - left.members.length || left.key.localeCompare(right.key));
  summary.crossTeamReferencedDuplicateCount = riskyGroups.length;
  summary.crossTeamReferencedDuplicateGroups = riskyGroups.slice(0, 200);
}

async function main() {
  ensureLogDir();

  const summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    mergeCandidateGroups: 0,
    mergePlan: [],
    updatedSnapshotRefs: 0,
    updatedRankAccountRefs: 0,
    updatedRankSnapshotRefs: 0,
    updatedRecentRefs: 0,
    updatedProfileRefs: 0,
    deletedDuplicatePlayers: 0,
    familyMergeCandidateGroups: 0,
    deletedFamilyMergedPlayers: 0,
    rehomeCandidateCount: 0,
    rehomedPlayers: 0,
    photoFillCandidateCount: 0,
    filledPhotos: 0,
    shellDeleteCandidateCount: 0,
    deletedShellPlayers: 0,
    foreignZeroRefDeleteCandidateCount: 0,
    deletedForeignZeroRefPlayers: 0,
    sampleZeroRefDeleteCandidateCount: 0,
    deletedSampleZeroRefPlayers: 0,
    weakReferencedShadowCandidateCount: 0,
    absorbedWeakReferencedPlayers: 0,
    crossTeamReferencedDuplicateCount: 0,
    crossTeamReferencedDuplicateGroups: [],
  };

  await mergeDuplicatePlayers(summary);
  await mergeFamilyPlayers(summary);
  await rehomeMismatchedPlayers(summary);
  await fillMissingPhotos(summary);
  await deleteShellPlayers(summary);
  await deleteForeignZeroRefPlayers(summary);
  await deleteSampleZeroRefPlayers(summary);
  await absorbWeakReferencedPlayers(summary);
  await auditCrossTeamReferencedDuplicates(summary);

  const finalState = await loadState();
  summary.finalPlayerCount = finalState.playerEntries.length;
  summary.finalPhotoMissingCount = finalState.playerEntries.filter((entry) => !entry.photo).length;
  summary.finalZeroRefNoPhotoCount = finalState.playerEntries.filter((entry) => entry.snapshotRefs === 0 && entry.rankRefs === 0 && !entry.photo).length;

  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), 'utf8');
  fs.writeFileSync(
    REMAINING_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        crossTeamReferencedDuplicateCount: summary.crossTeamReferencedDuplicateCount,
        crossTeamReferencedDuplicateGroups: summary.crossTeamReferencedDuplicateGroups,
      },
      null,
      2,
    ),
    'utf8',
  );
  if (AUDIT_CROSS_TEAM) {
    console.log(JSON.stringify({
      crossTeamReferencedDuplicateCount: summary.crossTeamReferencedDuplicateCount,
      crossTeamReferencedDuplicateGroups: summary.crossTeamReferencedDuplicateGroups,
    }, null, 2));
    return;
  }
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
