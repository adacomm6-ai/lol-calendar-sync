
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Identifying games with team-side mismatches...");

    const games = await prisma.game.findMany({
        where: {
            analysisData: { not: null },
            blueSideTeamId: { not: null },
            redSideTeamId: { not: null }
        },
        include: {
            match: {
                include: {
                    teamA: true,
                    teamB: true
                }
            }
        }
    });

    let mismatchCount = 0;
    const fixList = [];

    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const g of games) {
        try {
            const data = JSON.parse(g.analysisData);
            const jsonTeamA = normalize(data.teamA?.name);
            const jsonTeamB = normalize(data.teamB?.name);

            const dbBlueTeam = await prisma.team.findUnique({ where: { id: g.blueSideTeamId } });
            const dbRedTeam = await prisma.team.findUnique({ where: { id: g.redSideTeamId } });

            const dbBlueName = normalize(dbBlueTeam?.name);
            const dbBlueShort = normalize(dbBlueTeam?.shortName);
            const dbRedName = normalize(dbRedTeam?.name);
            const dbRedShort = normalize(dbRedTeam?.shortName);

            // Check if Blue ID matches Team A in JSON
            const blueMatchesA = jsonTeamA.includes(dbBlueName) || dbBlueName.includes(jsonTeamA) || (dbBlueShort && jsonTeamA.includes(dbBlueShort));
            const redMatchesB = jsonTeamB.includes(dbRedName) || dbRedName.includes(jsonTeamB) || (dbRedShort && jsonTeamB.includes(dbRedShort));

            // Check if swapped
            const blueMatchesB = jsonTeamB.includes(dbBlueName) || dbBlueName.includes(jsonTeamB) || (dbBlueShort && jsonTeamB.includes(dbBlueShort));
            const redMatchesA = jsonTeamA.includes(dbRedName) || dbRedName.includes(jsonTeamA) || (dbRedShort && jsonTeamA.includes(dbRedShort));

            if (!blueMatchesA && blueMatchesB && redMatchesA && !redMatchesB) {
                console.log(`[MISMATCH] Game ${g.id} (${g.match.teamA?.shortName} vs ${g.match.teamB?.shortName}): Sides appear SWAPPED.`);
                console.log(`  JSON: A=${data.teamA?.name}, B=${data.teamB?.name}`);
                console.log(`  DB: Blue=${dbBlueTeam?.name}, Red=${dbRedTeam?.name}`);
                fixList.push(g.id);
                mismatchCount++;
            }
        } catch (e) { }
    }

    console.log(`\nFound ${mismatchCount} games that need side swapping.`);

    if (mismatchCount > 0) {
        console.log("Executing fixes...");
        for (const id of fixList) {
            const g = await prisma.game.findUnique({ where: { id } });
            await prisma.game.update({
                where: { id },
                data: {
                    blueSideTeamId: g.redSideTeamId,
                    redSideTeamId: g.blueSideTeamId
                }
            });
            console.log(` - Fixed Game ${id}`);
        }
        console.log("All mismatches resolved.");
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
