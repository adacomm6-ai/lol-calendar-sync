
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';


export async function GET() {
    try {
        console.log('Starting GLOBAL Roster Cleanup (API V2.4)...');

        const junkNames = new Set([
            'sobord', 'flandre1', 'thehang', 'zuian', 'nia', 'jiadi', 'renard', 'glfs', 'sinian', 'yinova',
            'meiko' // USER REQUEST: TEMPORARILY DELETE MEIKO
        ]);

        // 2. Misassigned Map (Name -> Correct Team ShortName/Name)
        const reassignmentMap: Record<string, string> = {
            // TES
            '369': 'Top Esports',
            'Naiyou': 'Top Esports',
            'Creme': 'Top Esports',
            'Jackeylove': 'Top Esports',
            // 'Meiko': 'Top Esports', // Removed
            'Jiaqi': 'Top Esports',
            'Fengyue': 'Top Esports',

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

        const teams = await prisma.team.findMany({
            include: { players: true }
        });

        const teamIdMap: Record<string, string> = {};
        for (const t of teams) {
            if (t.shortName) teamIdMap[t.shortName] = t.id;
            teamIdMap[t.name] = t.id;
        }

        const logs: string[] = [];
        let totalDeleted = 0;
        let totalMoved = 0;

        for (const team of teams) {
            if (team.players.length === 0) continue;

            const nameMap = new Map();
            const playersToDelete = new Set<string>();
            const playersToMove: { id: string, targetId: string }[] = [];

            for (const p of team.players) {
                const normName = p.name.trim();
                const lowerName = normName.toLowerCase();

                // A. Check Junk
                if (junkNames.has(lowerName)) {
                    logs.push(`[DELETE] Junk Found: ${p.name} (Team: ${team.shortName})`);
                    playersToDelete.add(p.id);
                    continue;
                }

                // B. Check Reassignment
                const titleCase = normName.charAt(0).toUpperCase() + normName.slice(1).toLowerCase();
                const targetTeamStr = reassignmentMap[normName] || reassignmentMap[titleCase];

                if (targetTeamStr) {
                    const targetId = teamIdMap[targetTeamStr];
                    if (targetId) {
                        if (targetId !== team.id) {
                            logs.push(`[MOVE] Misassigned: ${p.name} from ${team.shortName} -> ${targetTeamStr}`);
                            playersToMove.push({ id: p.id, targetId: targetId });
                            continue;
                        }
                    }
                }

                // C. Group for Deduplication
                if (!nameMap.has(lowerName)) {
                    nameMap.set(lowerName, []);
                }
                nameMap.get(lowerName).push(p);
            }

            // Process Duplicates (Keep 1, Delete rest)
            for (const [name, list] of nameMap.entries()) {
                if (list.length > 1) {
                    list.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

                    const duplicates = list.slice(1);
                    duplicates.forEach((d: any) => {
                        logs.push(`[DELETE] Duplicate: ${d.name} (ID: ${d.id}) in ${team.shortName}`);
                        playersToDelete.add(d.id);
                    });
                }
            }

            // Execute DB Actions
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

        logs.push(`COMPLETE. Deleted: ${totalDeleted}, Moved: ${totalMoved}`);
        return NextResponse.json({ success: true, logs });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
