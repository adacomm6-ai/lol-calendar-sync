const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function normalizeBlob(blob) {
  if (!blob) return { changed: false, value: blob, reason: 'empty' };
  try {
    const parsed = JSON.parse(blob);
    if (Array.isArray(parsed)) {
      return { changed: false, value: blob, reason: 'array' };
    }
    if (parsed && Array.isArray(parsed.players)) {
      return { changed: true, value: JSON.stringify(parsed.players), reason: 'object_players' };
    }
    if (parsed && parsed.teamA && Array.isArray(parsed.teamA.players)) {
      return { changed: true, value: JSON.stringify(parsed.teamA.players), reason: 'nested_teamA_players' };
    }
    return { changed: false, value: blob, reason: 'other_object' };
  } catch {
    return { changed: false, value: blob, reason: 'parse_error' };
  }
}

(async () => {
  const games = await prisma.game.findMany({
    where: {
      OR: [
        { teamAStats: { not: null } },
        { teamBStats: { not: null } }
      ]
    },
    select: { id: true, teamAStats: true, teamBStats: true }
  });

  let changedGames = 0;
  let changedA = 0;
  let changedB = 0;
  const reasonCount = {};

  for (const g of games) {
    const a = normalizeBlob(g.teamAStats);
    const b = normalizeBlob(g.teamBStats);

    reasonCount[`A_${a.reason}`] = (reasonCount[`A_${a.reason}`] || 0) + 1;
    reasonCount[`B_${b.reason}`] = (reasonCount[`B_${b.reason}`] || 0) + 1;

    if (!a.changed && !b.changed) continue;

    await prisma.game.update({
      where: { id: g.id },
      data: {
        teamAStats: a.value,
        teamBStats: b.value,
      },
    });

    changedGames += 1;
    if (a.changed) changedA += 1;
    if (b.changed) changedB += 1;
  }

  console.log(JSON.stringify({
    scanned: games.length,
    changedGames,
    changedA,
    changedB,
    reasonCount,
  }, null, 2));

  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
