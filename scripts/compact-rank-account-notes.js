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
  ['閿?', '？'],
  ['閵?', '。'],
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

function normalizeLineKey(value) {
  return repairText(String(value || ''))
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[：:]\s+/g, '：')
    .toLowerCase();
}

function dedupeNoteText(value) {
  const seen = new Set();
  const lines = [];
  const text = repairText(String(value || '')).replace(/\r/g, '\n');

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const normalizedKey = normalizeLineKey(trimmed);
    if (!normalizedKey) continue;
    if (seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    lines.push(trimmed);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

async function main() {
  const { apply, verbose } = parseArgs(process.argv);
  const rows = await prisma.playerRankAccount.findMany({
    where: {
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
  let removedLines = 0;

  for (const row of rows) {
    const before = repairText(String(row.notes || '')).replace(/\r/g, '\n');
    const after = dedupeNoteText(before);
    if ((after || '') === before) continue;

    const beforeLineCount = before.split('\n').filter((line) => line.trim()).length;
    const afterLineCount = String(after || '')
      .split('\n')
      .filter((line) => line.trim()).length;

    removedLines += beforeLineCount - afterLineCount;
    changed.push({
      id: row.id,
      label: `${row.gameName}#${row.tagLine || ''}`.replace(/#$/, ''),
      playerName: row.player?.name || '--',
      teamName: row.player?.team?.shortName || row.player?.team?.name || '--',
      status: row.status || '--',
      beforeLineCount,
      afterLineCount,
      nextNotes: after,
    });
  }

  console.log(`[compact-rank-account-notes] mode=${apply ? 'apply' : 'dry-run'}`);
  console.log(`[compact-rank-account-notes] candidates=${changed.length} removedLines=${removedLines}`);

  if (verbose) {
    for (const item of changed.slice(0, 30)) {
      console.log(
        ` - ${item.label} | ${item.playerName} / ${item.teamName} | ${item.status} | ${item.beforeLineCount} -> ${item.afterLineCount}`,
      );
    }
  }

  if (!apply || changed.length === 0) return;

  for (const item of changed) {
    await prisma.playerRankAccount.update({
      where: { id: item.id },
      data: {
        notes: item.nextNotes,
      },
    });
  }

  console.log(`[compact-rank-account-notes] updated=${changed.length}`);
}

main()
  .catch((error) => {
    console.error('[compact-rank-account-notes] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
