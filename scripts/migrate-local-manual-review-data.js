const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function decodeManualReview(content) {
  const raw = String(content || '');
  const match = raw.match(/<!--manual-review:([\s\S]*?)-->/i);
  if (!match) return null;

  try {
    const payload = JSON.parse(decodeURIComponent(String(match[1] || '').replace(/%2D/g, '-')));
    return payload;
  } catch {
    return null;
  }
}

function normalizeType(type) {
  if (type === 'ANOMALY' || type === 'SPOTLIGHT' || type === 'RISK') return type;
  return 'HIGHLIGHT';
}

function deriveSummary(detail) {
  const firstLine = String(detail || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';

  if (!firstLine) return '未填写点评摘要';
  return firstLine.length > 34 ? `${firstLine.slice(0, 34)}...` : firstLine;
}

async function main() {
  const comments = await prisma.comment.findMany({
    where: { type: 'MANUAL_REVIEW' },
    orderBy: { createdAt: 'asc' },
  });

  let migrated = 0;

  for (const comment of comments) {
    const parsed = decodeManualReview(comment.content);
    if (!parsed || !parsed.teamId || !parsed.teamName || !parsed.playerId || !parsed.hero) {
      continue;
    }

    const detail = String(parsed.detail || '').trim();
    const summary = String(parsed.summary || '').trim() || deriveSummary(detail);

    const existing = await prisma.manualReview.findUnique({
      where: { legacyCommentId: comment.id },
    });

    const data = {
      matchId: comment.matchId,
      legacyCommentId: comment.id,
      gameNumber: Number(parsed.gameNumber || comment.gameNumber || 1) || 1,
      reviewType: normalizeType(parsed.reviewType),
      teamId: String(parsed.teamId || '').trim(),
      teamName: String(parsed.teamName || '').trim(),
      playerId: String(parsed.playerId || '').trim(),
      hero: String(parsed.hero || '').trim(),
      detail,
      summary,
      matchDate: String(parsed.matchDate || '').trim(),
      opponentTeamName: String(parsed.opponentTeamName || '').trim(),
      author: String(comment.author || 'Analyst').trim() || 'Analyst',
      createdAt: comment.createdAt,
    };

    if (existing) {
      await prisma.manualReview.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.manualReview.create({ data });
    }

    migrated += 1;
  }

  console.log(`[manual-review-migrate] synced ${migrated} legacy manual review comments.`);
}

main()
  .catch((error) => {
    console.error('[manual-review-migrate] failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
