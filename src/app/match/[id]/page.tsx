import { getCachedRecentStats } from "@/lib/data-cache";

export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import MatchDetailClient from "@/components/MatchDetailClient";
import { Suspense } from 'react';
import type { Game } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveGameVersionForMatch } from "@/lib/game-version";
import { buildCanonicalTeamIndex, canonicalizeMatchTeams } from "@/lib/team-canonical";

const MATCH_DETAIL_INCLUDE = {
    teamA: { include: { players: true, teamComments: { orderBy: { createdAt: 'desc' as const }, take: 1 } } },
    teamB: { include: { players: true, teamComments: { orderBy: { createdAt: 'desc' as const }, take: 1 } } },
    games: { orderBy: { gameNumber: 'asc' as const } },
    odds: true,
    comments: { orderBy: { createdAt: 'desc' as const } },
};

function getExpectedGameCount(formatValue?: string | null): number {
    const formatText = String(formatValue || '').toUpperCase();
    const match = formatText.match(/BO\s*(\d+)/i) || formatText.match(/(\d+)/);
    const parsed = match ? parseInt(match[1], 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

async function ensureGamesByFormat(match: any): Promise<boolean> {
    const expected = getExpectedGameCount(match?.format);
    const existing = new Set<number>(
        (match?.games || [])
            .map((g: any) => Number(g?.gameNumber))
            .filter((n: number) => Number.isFinite(n) && n > 0),
    );

    const missingRows: Array<{ matchId: string; gameNumber: number; blueSideTeamId: string | null; redSideTeamId: string | null }> = [];
    for (let i = 1; i <= expected; i++) {
        if (!existing.has(i)) {
            missingRows.push({
                matchId: match.id,
                gameNumber: i,
                blueSideTeamId: match.teamAId || null,
                redSideTeamId: match.teamBId || null,
            });
        }
    }

    if (missingRows.length === 0) return false;

    await prisma.$transaction(
        missingRows.map((row) =>
            prisma.game.create({
                data: row,
            }),
        ),
    );
    return true;
}

async function ensureMappedVersion(match: any): Promise<boolean> {
    const existingVersion = String(match?.gameVersion || '').trim();
    // Keep manually configured version; only auto-fill when missing.
    if (existingVersion) return false;

    const resolvedVersion = await resolveGameVersionForMatch({
        startTime: match?.startTime,
        tournament: match?.tournament,
        teamARegion: match?.teamA?.region || null,
        teamBRegion: match?.teamB?.region || null,
    });

    if (!resolvedVersion) return false;

    await prisma.match.update({
        where: { id: match.id },
        data: { gameVersion: resolvedVersion },
    });
    return true;
}

export default async function MatchDetailPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
    const { id } = await params;
    const { gameNumber } = await searchParams;

    let match = await prisma.match.findUnique({
        where: { id },
        include: MATCH_DETAIL_INCLUDE,
    });

    if (!match) notFound();

    const [patchedGames, patchedVersion] = await Promise.all([
        ensureGamesByFormat(match),
        ensureMappedVersion(match),
    ]);

    if (patchedGames || patchedVersion) {
        const refreshed = await prisma.match.findUnique({
            where: { id },
            include: MATCH_DETAIL_INCLUDE,
        });
        if (!refreshed) notFound();
        match = refreshed;
    }

    const allTeams = await prisma.team.findMany({
        select: {
            id: true,
            name: true,
            shortName: true,
            logo: true,
            region: true,
        },
    });
    const canonicalIndex = buildCanonicalTeamIndex(allTeams);
    const canonicalMatch = canonicalizeMatchTeams(match as any, canonicalIndex);
    const teamMap = new Map(
        canonicalIndex.canonicalTeams.map((team) => [team.id, team]),
    );

    // Attach teams to games
    const gamesWithTeams = (canonicalMatch.games as any[]).map((g: Game) => ({
        ...g,
        blueSideTeam: g.blueSideTeamId ? teamMap.get(g.blueSideTeamId) : null,
        redSideTeam: g.redSideTeamId ? teamMap.get(g.redSideTeamId) : null,
    }));

    // Keep original team object (teamComments included), only patch games
    const matchWithTeams = {
        ...canonicalMatch,
        games: gamesWithTeams,
    };

    const serializedMatch = JSON.parse(JSON.stringify(matchWithTeams));

    // --- RECENT STATS FETCHING (Team A & Team B) ---
    const teamAStats = canonicalMatch.teamAId ? await getCachedRecentStats(canonicalMatch.teamAId) : { duration: null, kills: null, tenMinKills: null };
    const teamBStats = canonicalMatch.teamBId ? await getCachedRecentStats(canonicalMatch.teamBId) : { duration: null, kills: null, tenMinKills: null };
    // -----------------------------------------------

    const initialGameNumber = gameNumber ? parseInt(Array.isArray(gameNumber) ? gameNumber[0] : gameNumber) : undefined;

    return (
        <div className="min-h-screen">
            <Suspense fallback={
                <div className="flex flex-col items-center justify-center p-20 gap-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-gray-400 font-bold tracking-widest text-xs animate-pulse">比赛数据加载中...</div>
                </div>
            }>
                <MatchDetailClient
                    match={serializedMatch}
                    initialGameNumber={initialGameNumber}
                    teamAStats={teamAStats}
                    teamBStats={teamBStats}
                />
            </Suspense>
        </div>
    );
}

