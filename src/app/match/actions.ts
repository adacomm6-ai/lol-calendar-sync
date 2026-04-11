'use server';

import { generateBettingStrategy } from "@/lib/gemini";
import { prisma } from "@/lib/db";
import { sortByStartTimeDesc } from "@/lib/time-utils";

export async function generateStrategyAction(matchId: string) {
    try {
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: {
                teamA: true,
                teamB: true,
                odds: true
            }
        });

        if (!match) return { error: "Match not found" };

        // 1. Fetch Recent Stats (Last 3)
        // Re-using logic from page.tsx roughly, but we need raw data for the AI to "Check Stability"
        const fetchRecent = async (teamId: string) => {
            const rawMatches = await prisma.match.findMany({
                where: {
                    OR: [{ teamAId: teamId }, { teamBId: teamId }],
                    status: 'FINISHED',
                    format: { in: ['BO3', 'BO5'] }
                },
                include: { games: true }
            });
            const matches = sortByStartTimeDesc(rawMatches).slice(0, 3);
            return matches.map(m => ({
                id: m.id,
                date: m.startTime,
                games: m.games.map(g => ({
                    duration: g.duration,
                    totalKills: g.totalKills,
                    winner: g.winnerId === teamId ? 'WIN' : 'LOSS'
                }))
            }));
        };

        const recentA = await fetchRecent(match.teamAId!);
        const recentB = await fetchRecent(match.teamBId!);

        // 1.5 Format Odds (MOVED UP)
        const oddsInfo = match.odds.map(o =>
            `Provider: ${o.provider}, Type: ${o.type}, A: ${o.teamAOdds}, B: ${o.teamBOdds}, Threshold: ${o.threshold}`
        ).join('\n');

        // 2. Pre-calculate Stats Summary (Averages)
        const calcStats = (teamName: string, matches: any[]) => {
            let totalGames = 0;
            let totalDuration = 0;
            let totalKills = 0;

            matches.forEach(m => {
                m.games.forEach((g: any) => {
                    if (g.duration) {
                        totalDuration += g.duration;
                        totalGames++;
                    }
                    if (g.totalKills) totalKills += g.totalKills;
                });
            });

            if (totalGames === 0) return `${teamName}: No Data`;

            const avgDurMins = totalDuration / totalGames / 60;
            const avgKills = totalKills / totalGames;

            return `${teamName} (Last 3 Series, ${totalGames} Games):
            - Avg Duration: ${avgDurMins.toFixed(1)} min
            - Avg Total Kills: ${avgKills.toFixed(1)}`;
        };

        const summaryA = calcStats(match.teamA?.name || 'Team A', recentA);
        const summaryB = calcStats(match.teamB?.name || 'Team B', recentB);

        const context = `
            MATCH: ${match.teamA?.name} vs ${match.teamB?.name}
            FORMAT: ${match.format}

            STATS SUMMARY (Use these for Threshold Comparison):
            ${summaryA}
            ${summaryB}

            ODDS (Available Markets):
            ${oddsInfo}

            RECENT FORM DETAILS:
            ${JSON.stringify({ teamA: recentA, teamB: recentB }, null, 2)}
        `;

        // 3. Call AI
        const strategy = await generateBettingStrategy(context);
        return { success: true, text: strategy.strategy_text };

    } catch (e: any) {
        console.error("Strategy Action Failed:", e);
        return { error: "Failed to generate strategy" };
    }
}
