const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ROLES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

async function main() {
    const games = await prisma.game.findMany({
        where: { analysisData: { not: null } }
    });

    // Map normalized name to Role
    const playerRoles = new Map();
    const normalize = (name) => name.replace(/\s+/g, '').toLowerCase();

    for (const game of games) {
        try {
            const data = JSON.parse(game.analysisData);
            let players = [];
            if (data.damage_data) players = data.damage_data;
            else if (data.teamA && data.teamA.players) {
                players = [...data.teamA.players, ...(data.teamB?.players || [])];
            }

            players.forEach((p, i) => {
                const name = p.name || p.player || p.player_name;
                if (!name) return;
                const role = ROLES[i % 5];
                playerRoles.set(normalize(name), role);
            });
        } catch (e) { }
    }

    console.log(`Extracted roles for ${playerRoles.size} unique players from local match records.`);

    const allPlayers = await prisma.player.findMany({ include: { team: true } });
    const unknownPlayers = allPlayers.filter(p => !p.role || p.role.trim().toUpperCase() === 'UNKNOWN');

    console.log(`Found ${unknownPlayers.length} UNKNOWN players to fix.`);
    let fixed = 0;

    for (const p of unknownPlayers) {
        const role = playerRoles.get(normalize(p.name));
        if (role) {
            console.log(`[FIXED] ${p.name} (${p.team?.name}) -> ${role}`);
            await prisma.player.updateMany({
                where: { name: p.name, teamId: p.teamId },
                data: { role }
            });
            fixed++;
        } else {
            console.log(`[SKIP]  ${p.name} (${p.team?.name}) -> Not found in local match data.`);
        }
    }

    console.log(`Successfully fixed ${fixed}/${unknownPlayers.length} players using local DB!`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
