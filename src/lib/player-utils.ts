import { prisma } from "@/lib/db";

export async function upsertPlayersFromStats(teamId: string | null, tournament: string | null, playersStats: any[]) {
    if (!teamId || !playersStats || playersStats.length === 0) return;

    try {
        for (const playerStat of playersStats) {
            // Usually the name might be "player.name" or "player.playerName" depending on formatting
            const name = playerStat.name || playerStat.playerName;
            const role = playerStat.role || "Unknown";

            if (!name) continue;

            const splitKeyword = tournament || "Unknown Tournament";

            // Find existing player by composite unique key
            const existingPlayer = await (prisma.player as any).findUnique({
                where: {
                    name_teamId: {
                        name: name,
                        teamId: teamId
                    }
                }
            });

            if (existingPlayer) {
                // Check if split needs update
                const currentSplits = existingPlayer.split ? existingPlayer.split.split(',').map((s: string) => s.trim()) : [];
                if (!currentSplits.includes(splitKeyword)) {
                    const newSplit = existingPlayer.split
                        ? `${existingPlayer.split}, ${splitKeyword}`
                        : splitKeyword;

                    await prisma.player.update({
                        where: { id: existingPlayer.id },
                        data: { split: newSplit }
                    });
                }
            } else {
                // Create new player
                await prisma.player.create({
                    data: {
                        name: name,
                        role: role,
                        teamId: teamId,
                        split: splitKeyword
                    }
                });
            }
        }
    } catch (error) {
        console.error("Error generating/updating players from stats:", error);
    }
}
