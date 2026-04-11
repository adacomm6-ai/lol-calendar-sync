const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function getArg(name) {
  const hit = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function normalizeText(v) {
  return String(v || '').trim().toUpperCase();
}

function toMs(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function toBeijingDay(v) {
  const ms = toMs(v);
  if (ms === null) return null;
  const bj = new Date(ms + 8 * 60 * 60 * 1000);
  return bj.toISOString().slice(0, 10);
}

function matchBelongsToRegion(match, region) {
  if (!region) return true;
  const tournament = normalizeText(match.tournament);
  const teamARegion = normalizeText(match.teamA?.region);
  const teamBRegion = normalizeText(match.teamB?.region);
  return tournament.includes(region) || teamARegion.includes(region) || teamBRegion.includes(region);
}

function scoreMatch(match) {
  const status = normalizeText(match.status);
  const count = match._count || { games: 0, comments: 0, odds: 0 };
  return (
    count.games * 100 +
    count.comments * 20 +
    count.odds * 10 +
    (status === 'FINISHED' || status === 'COMPLETED' ? 40 : 0) +
    (match.winnerId ? 15 : 0) +
    (match.externalMatchId ? 8 : 0)
  );
}

function canSafelyDeleteDuplicate(keep, dup) {
  const keepCount = keep._count || { games: 0, comments: 0, odds: 0 };
  const dupCount = dup._count || { games: 0, comments: 0, odds: 0 };
  return (
    keepCount.games >= dupCount.games &&
    keepCount.comments >= dupCount.comments &&
    keepCount.odds >= dupCount.odds
  );
}

function canMergeGamesOnly(keep, dup) {
  const keepCount = keep._count || { games: 0, comments: 0, odds: 0 };
  const dupCount = dup._count || { games: 0, comments: 0, odds: 0 };
  return (
    dupCount.games > 0 &&
    dupCount.comments === 0 &&
    dupCount.odds === 0 &&
    keepCount.comments >= dupCount.comments &&
    keepCount.odds >= dupCount.odds
  );
}

async function mergeGamesFromDuplicate(keepId, dupId) {
  const keepGames = await prisma.game.findMany({ where: { matchId: keepId }, select: { id: true, gameNumber: true, externalSourceResultId: true } });
  const dupGames = await prisma.game.findMany({ where: { matchId: dupId }, select: { id: true, gameNumber: true, externalSourceResultId: true } });

  const keepNums = new Set(keepGames.map((g) => g.gameNumber));
  const keepExtIds = new Set(keepGames.map((g) => g.externalSourceResultId).filter(Boolean));

  for (const game of dupGames) {
    if (keepNums.has(game.gameNumber)) continue;

    const updateData = { matchId: keepId };
    if (game.externalSourceResultId && keepExtIds.has(game.externalSourceResultId)) {
      updateData.externalSourceResultId = null;
    }

    await prisma.game.update({ where: { id: game.id }, data: updateData });
    keepNums.add(game.gameNumber);
    if (game.externalSourceResultId) keepExtIds.add(game.externalSourceResultId);
  }
}

function ensureLocalBackup() {
  const projectRoot = process.cwd();
  const dbPath = path.join(projectRoot, 'prisma', 'dev.db');
  if (!fs.existsSync(dbPath)) throw new Error(`Local DB not found: ${dbPath}`);

  const backupDir = path.join(projectRoot, 'backups', 'local-db');
  fs.mkdirSync(backupDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `dev.pre-dedupe-${ts}.db`);
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

function chooseKeep(list) {
  return [...list].sort((a, b) => {
    const diff = scoreMatch(b) - scoreMatch(a);
    if (diff !== 0) return diff;
    const aCreated = new Date(a.createdAt).getTime();
    const bCreated = new Date(b.createdAt).getTime();
    if (aCreated !== bCreated) return aCreated - bCreated;
    return String(a.id).localeCompare(String(b.id));
  })[0];
}

function splitByTimeClusters(sortedList, maxGapMs) {
  const clusters = [];
  let current = [];
  let startMs = null;

  for (const item of sortedList) {
    const ms = toMs(item.startTime);
    if (ms === null) continue;

    if (current.length === 0) {
      current = [item];
      startMs = ms;
      continue;
    }

    if (startMs !== null && ms - startMs <= maxGapMs) {
      current.push(item);
      continue;
    }

    clusters.push(current);
    current = [item];
    startMs = ms;
  }

  if (current.length > 0) clusters.push(current);
  return clusters;
}

async function main() {
  const region = normalizeText(getArg('--region')) || '';
  const dryRun = hasFlag('--dry-run');
  const maxGapMs = 3 * 60 * 60 * 1000;

  const matches = await prisma.match.findMany({
    where: {
      startTime: { not: null },
      teamAId: { not: null },
      teamBId: { not: null },
    },
    include: {
      teamA: { select: { name: true, shortName: true, region: true } },
      teamB: { select: { name: true, shortName: true, region: true } },
      _count: { select: { games: true, comments: true, odds: true } },
    },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
  });

  const grouped = new Map();
  for (const match of matches) {
    if (!matchBelongsToRegion(match, region)) continue;

    const day = toBeijingDay(match.startTime);
    if (!day || !match.teamAId || !match.teamBId) continue;

    const pair = [match.teamAId, match.teamBId].sort().join('__');
    const fmt = normalizeText(match.format || 'BO3');
    const key = `${day}__${pair}__${fmt}`;

    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(match);
  }

  const duplicateClusters = [];

  for (const [key, list] of grouped.entries()) {
    if (list.length < 2) continue;

    const sorted = [...list].sort((a, b) => toMs(a.startTime) - toMs(b.startTime));
    const clusters = splitByTimeClusters(sorted, maxGapMs);

    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const keep = chooseKeep(cluster);
      const dups = cluster.filter((m) => m.id !== keep.id);
      duplicateClusters.push({ key, keep, dups });
    }
  }

  const deletable = [];
  const mergeCandidates = [];
  const protectedDups = [];

  for (const cluster of duplicateClusters) {
    for (const dup of cluster.dups) {
      if (canSafelyDeleteDuplicate(cluster.keep, dup)) {
        deletable.push({ group: cluster.key, keep: cluster.keep.id, id: dup.id, mode: 'delete' });
      } else if (canMergeGamesOnly(cluster.keep, dup)) {
        mergeCandidates.push({ group: cluster.key, keep: cluster.keep.id, id: dup.id, mode: 'merge_games_then_delete' });
      } else {
        protectedDups.push({
          group: cluster.key,
          keep: cluster.keep.id,
          id: dup.id,
          keepCount: cluster.keep._count,
          dupCount: dup._count,
        });
      }
    }
  }

  console.log('region=', region || 'ALL');
  console.log('duplicateClusters=', duplicateClusters.length);
  console.log('deletable=', deletable.length);
  console.log('mergeCandidates=', mergeCandidates.length);
  console.log('protected=', protectedDups.length);

  if (protectedDups.length > 0) {
    console.log('protected-sample=', protectedDups.slice(0, 10));
  }

  if (dryRun || (deletable.length === 0 && mergeCandidates.length === 0)) {
    console.log(dryRun ? 'dry-run: no deletion executed.' : 'nothing to delete.');
    return;
  }

  const backupPath = ensureLocalBackup();
  console.log('backup=', backupPath);

  for (const item of deletable) {
    await prisma.game.deleteMany({ where: { matchId: item.id } });
    await prisma.comment.deleteMany({ where: { matchId: item.id } });
    await prisma.odds.deleteMany({ where: { matchId: item.id } });
    await prisma.match.delete({ where: { id: item.id } });
  }

  for (const item of mergeCandidates) {
    await mergeGamesFromDuplicate(item.keep, item.id);
    await prisma.game.deleteMany({ where: { matchId: item.id } });
    await prisma.comment.deleteMany({ where: { matchId: item.id } });
    await prisma.odds.deleteMany({ where: { matchId: item.id } });
    await prisma.match.delete({ where: { id: item.id } });
  }

  console.log('deleted=', deletable.length);
  console.log('mergedThenDeleted=', mergeCandidates.length);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
