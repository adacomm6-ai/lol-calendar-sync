
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Starting GLOBAL Roster Cleanup (Deduplication + Targeted Fix) V2.4...');

    // --- CONFIGURATION ---

    const junkNames = new Set([
        'sobord', 'flandre1', 'thehang', 'zuian', 'nia', 'jiadi', 'renard', 'glfs', 'sinian', 'yinova',
        'meiko' // USER REQUEST: TEMPORARILY DELETE MEIKO
    ]);

    // 2. Misassigned Map (Name -> Correct Team ShortName/Name)
    const reassignmentMap = {
        // TES
        '369': 'Top Esports',
        'Naiyou': 'Top Esports',
        'Creme': 'Top Esports',
        'Jackeylove': 'Top Esports',
        // 'Meiko': 'Top Esports', // Removed from reassignment to allow deletion if in junkNames
        'Jiaqi': 'Top Esports',
        'Fengyue': 'Top Esports',

        // Fix: Move Hang OUT of TES 
        'Hang': 'LNG Esports',

        // IG
        'Soboro': 'Invictus Gaming',
        'Wei': 'Invictus Gaming',
        'Rookie': 'Invictus Gaming',
        'Photic': 'Invictus Gaming',
        'Jwei': 'Invictus Gaming',

        // AL
        'Flandre': "Anyone's Legend",
        'Tarzan': "Anyone's Legend",
        'Shanks': "Anyone's Legend",
        'Hope': "Anyone's Legend",
        'Kael': "Anyone's Legend",
    };

    // --- EXECUTION ---

    // 1. Get All Teams
    const teams = await prisma.team.findMany({
        include: { players: true }
    });

    // Pre-fetch IDs for reassignment targets
    const teamIdMap = {};
    for (const t of teams) {
        if (t.shortName) teamIdMap[t.shortName] = t.id;
        teamIdMap[t.name] = t.id;
    }

    let totalDeleted = 0;
    let totalMoved = 0;

    for (const team of teams) {
        if (team.players.length === 0) continue;

        // Group by normalized name
        const nameMap = new Map();
        const playersToDelete = new Set();
        const playersToMove = []; // { player, targetTeamId }

        for (const p of team.players) {
            const normName = p.name.trim();
            const lowerName = normName.toLowerCase();

            // A. Check Junk (Priority High)
            if (junkNames.has(lowerName)) {
                console.log(`[DELETE] Junk Found: ${p.name} (Team: ${team.shortName})`);
                playersToDelete.add(p.id);
                continue;
            }

            // B. Check Reassignment
            const titleCase = normName.charAt(0).toUpperCase() + normName.slice(1).toLowerCase();

            let targetTeamStr = reassignmentMap[normName] || reassignmentMap[titleCase];

            if (targetTeamStr) {
                const targetId = teamIdMap[targetTeamStr];
                if (targetId) {
                    if (targetId !== team.id) {
                        console.log(`[MOVE] Misassigned: ${p.name} from ${team.shortName} -> ${targetTeamStr}`);
                        playersToMove.push({ id: p.id, targetId: targetId });
                        continue;
                    }
                }
            }

            // C. Group for Deduplication within THIS team
            if (!nameMap.has(lowerName)) {
                nameMap.set(lowerName, []);
            }
            nameMap.get(lowerName).push(p);
        }

        // Process Duplicates (Keep 1, Delete rest)
        for (const [name, list] of nameMap.entries()) {
            if (list.length > 1) {
                list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

                const duplicates = list.slice(1);
                duplicates.forEach(d => {
                    console.log(`[DELETE] Duplicate: ${d.name} (ID: ${d.id}) in ${team.shortName}`);
                    playersToDelete.add(d.id);
                });
            }
        }

        // Execute DB Actions for this Team
        if (playersToDelete.size > 0) {
            await prisma.player.deleteMany({
                where: { id: { in: Array.from(playersToDelete) } }
            });
            totalDeleted += playersToDelete.size;
        }

        if (playersToMove.length > 0) {
            for (const move of playersToMove) {
                await prisma.player.update({
                    where: { id: move.id },
                    data: {
                        teamId: move.targetId,
                        split: '2026 LPL第一赛段'
                    }
                });
                totalMoved++;
            }
        }
    }

    console.log(`COMPLETE. Deleted: ${totalDeleted}, Moved: ${totalMoved}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
