const path = require('path');
const dotenv = require('dotenv');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRootDbPath = path.resolve(projectRoot, '..', '..', 'prisma', 'dev.db');
const preferredDbPath = projectRoot.includes('__recovery_work__')
  ? workspaceRootDbPath
  : path.join(projectRoot, 'prisma', 'dev.db');

dotenv.config({ path: path.join(projectRoot, '.env.local'), override: false, quiet: true });
dotenv.config({ path: path.join(projectRoot, '.env'), override: false, quiet: true });

process.env.APP_DB_TARGET = 'local';
process.env.DATABASE_URL = process.env.DATABASE_URL || `file:${preferredDbPath.replace(/\\/g, '/')}`;

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TEXT_REPLACEMENTS = [
  ['寰呯‘璁ゆ槧灏?', '待确认映射'],
  ['鑷姩琛ラ綈鏄犲皠', '自动补齐映射'],
  ['鑷姩鍗犱綅锛氬叕寮€鏉ユ簮鏆傛湭鍙戠幇鍙獙璇佽处鍙凤紝寰呭悗缁浛鎹紙', '自动占位：公开来源暂未发现可验证账号，待后续替换（'],
  ['淇濈暀鍗犱綅鏄犲皠锛岀敤浜庡悗缁叕寮€婧愮户缁繁鎸栥€?', '保留占位映射，用于后续公开源继续深挖。'],
  ['锛?', '：'],
  ['銆?', '。'],
];

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    apply: args.has('--apply'),
    verbose: args.has('--verbose'),
  };
}

function repairText(value) {
  let text = String(value || '');
  for (const [from, to] of TEXT_REPLACEMENTS) {
    text = text.split(from).join(to);
  }
  return text;
}

function isQuestionNoise(value) {
  const text = repairText(String(value || '')).trim();
  if (!text) return true;
  if ((text.match(/\?/g) || []).length >= 4) return true;
  if (/^\?+$/.test(text)) return true;
  const compact = text.replace(/[\s:()（）/#.,，。-]+/g, '');
  return compact.length > 0 && /^\?+$/.test(compact);
}

function normalizePlaceholderGameName(gameName) {
  const normalized = repairText(String(gameName || '')).trim();
  if (!normalized) return '待确认映射';
  if (normalized === '待确认映射' || normalized === '自动补齐映射') return normalized;
  if (/待确认|占位|placeholder|pending|manual/i.test(normalized)) return '待确认映射';
  if (isQuestionNoise(normalized)) return '待确认映射';
  return normalized;
}

function isPlaceholderLikeAccount(row) {
  const normalizedGameName = normalizePlaceholderGameName(row.gameName);
  return normalizedGameName === '待确认映射' || normalizedGameName === '自动补齐映射';
}

function buildBasePlaceholderNote(row) {
  const teamName = row.player?.team?.shortName || row.player?.team?.name || '--';
  return `自动占位：公开来源暂未发现可验证账号，待后续替换（${row.player?.name || '--'} / ${teamName}）`;
}

function shouldDropDuplicateArchiveLine(line, row) {
  if (!line.startsWith('自动归档：重复账号，保留')) return false;
  const playerName = String(row.player?.name || '').trim();
  const teamName = String(row.player?.team?.shortName || row.player?.team?.name || '').trim();
  return !(playerName && line.includes(playerName)) && !(teamName && line.includes(teamName));
}

function buildStatusLine(status) {
  const normalizedStatus = String(status || '').trim().toUpperCase();
  if (normalizedStatus === 'ARCHIVED') {
    return '历史归档占位：保留旧映射记录，供后续复核。';
  }
  if (normalizedStatus === 'SUSPECT') {
    return '保留占位映射，用于后续公开源继续深挖。';
  }
  return '占位映射待复核。';
}

function normalizePlaceholderNotes(row) {
  const original = repairText(String(row.notes || '')).replace(/\r/g, '\n');
  const originalLines = original
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const baseLine = buildBasePlaceholderNote(row);
  const statusLine = buildStatusLine(row.status);
  const lines = [baseLine, statusLine];

  for (const line of originalLines) {
    if (isQuestionNoise(line)) continue;
    if (line === baseLine || line === statusLine) continue;
    if (line.startsWith('自动占位：公开来源暂未发现可验证账号')) continue;
    if (line.startsWith('保留占位映射，用于后续公开源继续深挖。')) continue;
    if (line.startsWith('历史归档占位：保留旧映射记录')) continue;
    if (line.startsWith('占位映射待复核。')) continue;
    if (shouldDropDuplicateArchiveLine(line, row)) continue;
    if (lines.includes(line)) continue;
    lines.push(line);
  }

  return lines.join('\n');
}

async function main() {
  const { apply, verbose } = parseArgs(process.argv);
  const rows = await prisma.playerRankAccount.findMany({
    where: {
      source: 'MANUAL',
      notes: {
        not: null,
      },
    },
    select: {
      id: true,
      gameName: true,
      tagLine: true,
      status: true,
      notes: true,
      player: {
        select: {
          name: true,
          team: {
            select: {
              shortName: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
  });

  const changed = [];

  for (const row of rows) {
    if (!isPlaceholderLikeAccount(row)) continue;
    const nextGameName = normalizePlaceholderGameName(row.gameName);
    const nextNotes = normalizePlaceholderNotes(row);

    if (nextGameName === row.gameName && nextNotes === String(row.notes || '')) continue;

    changed.push({
      id: row.id,
      playerName: row.player?.name || '--',
      teamName: row.player?.team?.shortName || row.player?.team?.name || '--',
      status: row.status || '--',
      currentGameName: row.gameName,
      nextGameName,
      currentNotes: String(row.notes || ''),
      nextNotes,
    });
  }

  console.log(`[repair-rank-placeholder-text] mode=${apply ? 'apply' : 'dry-run'}`);
  console.log(`[repair-rank-placeholder-text] candidates=${changed.length}`);

  if (verbose) {
    for (const item of changed.slice(0, 30)) {
      console.log(` - ${item.playerName} / ${item.teamName} | ${item.status} | ${item.currentGameName} -> ${item.nextGameName}`);
      console.log(`   before: ${item.currentNotes}`);
      console.log(`   after : ${item.nextNotes}`);
    }
  }

  if (!apply || changed.length === 0) return;

  for (const item of changed) {
    await prisma.playerRankAccount.update({
      where: { id: item.id },
      data: {
        gameName: item.nextGameName,
        notes: item.nextNotes,
      },
    });
  }

  console.log(`[repair-rank-placeholder-text] updated=${changed.length}`);
}

main()
  .catch((error) => {
    console.error('[repair-rank-placeholder-text] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
