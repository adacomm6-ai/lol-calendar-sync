
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const g = await prisma.game.findUnique({
        where: { id: '3f9b1056-a0fd-46e5-b60c-ccada31619c4' },
        include: { match: { include: { teamA: true, teamB: true } } }
    });

    console.log("Game Info:");
    console.log(" - Match:", g.match.teamA?.shortName, "vs", g.match.teamB?.shortName);
    console.log(" - Tournament:", g.match.tournament);
    console.log(" - Blue Side Team ID:", g.blueSideTeamId);
    console.log(" - Red Side Team ID:", g.redSideTeamId);
    console.log("\nAnalysis Data Preview:");
    const data = JSON.parse(g.analysisData);
    console.log(" - Team A (in JSON):", data.teamA?.name);
    console.log("   Players:", data.teamA?.players?.map(p => p.name).join(', '));
    console.log(" - Team B (in JSON):", data.teamB?.name);
    console.log("   Players:", data.teamB?.players?.map(p => p.name).join(', '));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
