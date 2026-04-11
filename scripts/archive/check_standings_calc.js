const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Simulate Standings Page Logic for LPL
    const region = 'LPL';
    const tournamentFilter = '2026 LPL第一赛段';
    const matches = await prisma.match.findMany({
        where: {
            tournament: { contains: tournamentFilter },
            status: 'FINISHED'
        },
        include: { games: true }
    });

    const teams = await prisma.team.findMany({ where: { region } });
    const stats = {};

    teams.forEach(t => {
        stats[t.id] = { name: t.shortName, matchWin: 0, matchLoss: 0, gameWin: 0, gameLoss: 0, points: 0, gameDiff: 0 };
    });

    matches.forEach(m => {
        const winnerId = m.winnerId;
        if (!winnerId) return;

        console.log(`Processing Match: ${m.id} ${m.startTime} A:${m.teamAId} B:${m.teamBId} Winner:${winnerId}`);

        const loserId = m.teamAId === winnerId ? m.teamBId : m.teamAId;

        if (stats[winnerId]) {
            stats[winnerId].matchWin++;
            stats[winnerId].points++;
        }
        if (stats[loserId]) {
            stats[loserId].matchLoss++;
        }

        m.games.forEach(g => {
            if (stats[g.winnerId]) stats[g.winnerId].gameWin++;

            // Loser of game? 
            // We need to know who lost the game.
            // Game store winnerId.
            // Assume other team is loser.
            // If g.winnerId == m.teamAId, then m.teamBId lost.
            const gameLoserId = g.winnerId === m.teamAId ? m.teamBId : m.teamAId;
            if (stats[gameLoserId]) stats[gameLoserId].gameLoss++;
        });
    });

    Object.values(stats).forEach(s => {
        s.gameDiff = s.gameWin - s.gameLoss;
    });

    const sorted = Object.values(stats).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.gameDiff - a.gameDiff;
    });

    console.log('--- LCK STANDINGS ---');
    sorted.forEach((s, i) => {
        if (s.matchWin > 0 || s.matchLoss > 0)
            console.log(`${i + 1}. ${s.name} ${s.matchWin}-${s.matchLoss} (${s.gameWin}-${s.gameLoss}) Pts:${s.points} Diff:${s.gameDiff}`);
    });
}

main();
