
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import TeamCommentsSection from "@/components/team/TeamCommentsSection";
import TeamRecentStats from "@/components/team/TeamRecentStats";
import RosterEditor from "@/components/team/RosterEditor";
import TeamLogoUpload from "@/components/team/TeamLogoUpload";
import TeamMatchHistoryClient from "@/components/team/TeamMatchHistoryClient";
import { calculateRecentSeriesAverages } from "@/lib/recent-series-stats";
import { getTeamShortDisplayName } from "@/lib/team-display";
import {
    buildCanonicalTeamIndex,
    canonicalizeMatchTeams,
    getCanonicalTeam,
    getCanonicalTeamByIdentity,
    getRelatedTeamIds,
    getRelatedTeamIdsByIdentity,
    pickPreferredCanonicalTeam,
} from "@/lib/team-canonical";

function toEpochMs(value: unknown): number {
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? ms : 0;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    const text = String(value || '').trim();
    if (!text) return 0;

    if (/^\d+$/.test(text)) {
        const asNum = Number(text);
        return Number.isFinite(asNum) ? asNum : 0;
    }

    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRosterRole(value: unknown): string {
    const role = String(value || '').trim().toUpperCase();
    if (!role) return 'UNKNOWN';

    if (['TOP', '上单'].includes(role)) return 'TOP';
    if (['JUG', 'JGL', 'JNG', 'JUN', 'JUNGLE', '打野'].includes(role)) return 'JUNGLE';
    if (['MID', '中单'].includes(role)) return 'MID';
    if (['ADC', 'AD', 'BOT', '下路'].includes(role)) return 'ADC';
    if (['SUP', 'SUPPORT', '辅助'].includes(role)) return 'SUPPORT';
    if (['COACH', '教练'].includes(role)) return 'COACH';

    return role;
}

// Force IDE refresh
export const dynamic = "force-dynamic";
export default async function TeamDetailPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ tournament?: string }> }) {
    const { id } = await params;
    const { tournament } = await searchParams;

    let requestedTeam = await prisma.team.findUnique({
        where: { id },
    });

    // FALLBACK: If unique ID fails, try searching by name or shortName (handle URL encoding or ID/Name confusion)
    if (!requestedTeam) {
        requestedTeam = await prisma.team.findFirst({
            where: {
                OR: [
                    { name: { equals: id } },
                    { shortName: { equals: id } },
                    { id: { contains: id.replace(/%20/g, ' ') } }
                ]
            }
        });
    }

    if (!requestedTeam) {
        notFound();
    }

    const allTeams = await prisma.team.findMany({
        orderBy: { name: 'asc' },
        select: {
            id: true,
            name: true,
            shortName: true,
            region: true,
            logo: true,
        },
    });
    const canonicalIndex = buildCanonicalTeamIndex(allTeams);
    const canonicalTeam = pickPreferredCanonicalTeam(
        getCanonicalTeam(requestedTeam.id, canonicalIndex),
        getCanonicalTeamByIdentity(requestedTeam, canonicalIndex, requestedTeam.region),
    ) || requestedTeam;

    if (canonicalTeam.id !== requestedTeam.id || requestedTeam.id !== id) {
        const normalizedTournament = String(tournament || '').trim();
        const query = normalizedTournament
            ? `?tournament=${encodeURIComponent(normalizedTournament)}`
            : '';
        redirect(`/teams/${canonicalTeam.id}${query}`);
    }

    const relatedTeamIds = Array.from(
        new Set([
            ...getRelatedTeamIds(requestedTeam.id, canonicalIndex),
            ...getRelatedTeamIds(canonicalTeam.id, canonicalIndex),
            ...getRelatedTeamIdsByIdentity(requestedTeam, canonicalIndex, requestedTeam.region),
            ...getRelatedTeamIdsByIdentity(canonicalTeam, canonicalIndex, canonicalTeam.region),
            requestedTeam.id,
            canonicalTeam.id,
        ]),
    );

    const [players, teamComments, matchesAsA, matchesAsB] = await Promise.all([
        prisma.player.findMany({
            where: { teamId: { in: relatedTeamIds } },
            orderBy: [{ role: 'asc' }, { name: 'asc' }],
        }),
        prisma.teamComment.findMany({
            where: { teamId: { in: relatedTeamIds } },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.match.findMany({
            where: { teamAId: { in: relatedTeamIds } },
            orderBy: { startTime: 'desc' },
            include: { teamB: true, teamA: true, games: true },
        }),
        prisma.match.findMany({
            where: { teamBId: { in: relatedTeamIds } },
            orderBy: { startTime: 'desc' },
            include: { teamA: true, teamB: true, games: true },
        }),
    ]);

    const dedupedPlayers = Array.from(
        players.reduce((map, player) => {
            const normalizedRole = normalizeRosterRole(player.role);
            const normalizedName = String(player.name || '').trim().toLowerCase();
            const key = `${normalizedRole}::${normalizedName}`;
            const existing = map.get(key);
            if (!existing) {
                map.set(key, { ...player, role: normalizedRole });
                return map;
            }

            const existingScore = (String(existing.photo || '').trim() ? 1000 : 0) + (existing.teamId === canonicalTeam.id ? 100 : 0);
            const playerScore = (String(player.photo || '').trim() ? 1000 : 0) + (player.teamId === canonicalTeam.id ? 100 : 0);
            if (playerScore > existingScore) {
                map.set(key, { ...player, role: normalizedRole });
            }
            return map;
        }, new Map<string, (typeof players)[number]>() ).values(),
    );

    const team = {
        ...requestedTeam,
        ...canonicalTeam,
        id: canonicalTeam.id,
        players: dedupedPlayers,
        teamComments,
    };
    const teamDisplayName = getTeamShortDisplayName(team);

    // Combine matches
    const allMatches = [...matchesAsA, ...matchesAsB]
        .map((match) => canonicalizeMatchTeams(match, canonicalIndex))
        .sort((a, b) => {
        const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
        const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
        return timeB - timeA;
    });

    // Extract tournaments with alias dedupe
    const normalizeTournamentAliasKey = (value: unknown) => {
        const stopwords = new Set(['season', '赛季', 'unknown', '未知', 'tournament', '赛事', 'vs', 'versus', 'regular', 'playoffs', 'group', 'stage', 'swiss', 'playin']);
        const normalizeToken = (token: string) => {
            if (token === 'playoff' || token === 'playoffs' || token === '季后赛') return 'playoffs';
            if (token === 'group' || token === 'groups') return 'group';
            if (token === 'stage' || token === '阶段') return 'stage';
            return token;
        };

        return String(value || '')
            .toLowerCase()
            .replace(/[^\w\u4e00-\u9fa5]+/g, ' ')
            .split(/\s+/)
            .map((token) => token.trim())
            .filter(Boolean)
            .map(normalizeToken)
            .filter((token) => !stopwords.has(token))
            .sort()
            .join(' ');
    };

    const scoreTournamentLabel = (value: unknown) => {
        const t = String(value || '').trim();
        if (!t) return 0;
        let score = 0;
        if (/^[A-Za-z]+\s+20\d{2}\b/.test(t)) score += 20;
        if (/\b20\d{2}\b/.test(t)) score += 8;
        if (/\b(split|cup)\b/i.test(t)) score += 6;
        if (/\b(playoffs?|regular|group|stage|swiss|play[- ]?in)\b/i.test(t)) score -= 4;
        if (t.toLowerCase().includes('unknown') || t.includes('未知')) score -= 1000;
        score -= Math.max(0, t.length - 36) * 0.05;
        return score;
    };

    const groupedTournamentAlias = new Map<string, string[]>();
    allMatches.forEach((m) => {
        const raw = String(m.tournament || '').trim();
        if (!raw) return;
        const key = normalizeTournamentAliasKey(raw);
        const list = groupedTournamentAlias.get(key) || [];
        if (!list.includes(raw)) list.push(raw);
        groupedTournamentAlias.set(key, list);
    });

    const tournamentAliasMap = new Map<string, string[]>();
    groupedTournamentAlias.forEach((aliases) => {
        const display = aliases.slice().sort((left, right) => {
            const diff = scoreTournamentLabel(right) - scoreTournamentLabel(left);
            if (diff !== 0) return diff;
            return left.localeCompare(right);
        })[0];
        tournamentAliasMap.set(display, aliases);
    });

    const tournaments = ['All', ...Array.from(tournamentAliasMap.keys()).sort((a, b) => b.localeCompare(a))];

    const requestedTournament = String(tournament || 'All').trim();
    const selectedTournament = requestedTournament === 'All'
        ? 'All'
        : tournamentAliasMap.has(requestedTournament)
            ? requestedTournament
            : Array.from(tournamentAliasMap.entries()).find(([, aliases]) => aliases.includes(requestedTournament))?.[0] || 'All';

    const tournamentOptions = tournaments.map((label) => ({
        label,
        aliases: label === 'All'
            ? []
            : (tournamentAliasMap.get(label) || [label]),
    }));

    // --- Recent Stats Calculation ---
    // Fetch last 2 BO3/BO5 matches specifically to get game details (duration, kills)
    // We do this separately to avoid over-fetching 'games' on the main 'team' query which loads ALL matches
    const candidateRecentMatches = await prisma.match.findMany({
        where: {
            OR: [
                ...relatedTeamIds.map((relatedId) => ({ teamAId: relatedId })),
                ...relatedTeamIds.map((relatedId) => ({ teamBId: relatedId })),
            ],
            status: 'FINISHED',
            format: { in: ['BO3', 'BO5', 'Bo3', 'Bo5', 'bo3', 'bo5'] }
        },
        include: {
            games: true,
            teamA: true,
            teamB: true
        }
    });
    const recentMatches = candidateRecentMatches
        .map((match) => canonicalizeMatchTeams(match, canonicalIndex))
        .slice()
        .sort((left, right) => toEpochMs(right.startTime) - toEpochMs(left.startTime))
        .slice(0, 3);

    let statsMatchCount = recentMatches.length;
    const recentStats = calculateRecentSeriesAverages(recentMatches);
    const avgDurationStr = recentStats.duration ?? "暂无";
    const avgKillsStr = recentStats.kills ?? "暂无";
    const avgTenMinKillsStr = recentStats.tenMinKills ?? "暂无";
    // -------------------------------
    return (
        <div className="w-full space-y-10">
            {/* Header */}
            <div className="bg-white border border-gray-200 rounded-2xl p-8 flex items-center gap-8 shadow-sm">
                <TeamLogoUpload teamId={team.id} initialLogo={team.logo} teamName={team.name} teamRegion={team.region} />
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl font-bold text-gray-900">{teamDisplayName}</h1>
                        <span className="px-2.5 py-1 text-sm font-bold bg-blue-50 text-blue-600 rounded uppercase tracking-wider">{team.region}</span>
                    </div>
                    {team.name && team.name !== teamDisplayName && <p className="text-xl text-gray-500 font-mono mt-1">{team.name}</p>}
                </div>
            </div>


            {/* Team Comments Section */}
            <TeamCommentsSection teamId={team.id} comments={team.teamComments} />

            {/* Recent Stats Analysis */}
            {statsMatchCount > 0 && (
                <TeamRecentStats
                    averageDuration={avgDurationStr}
                    averageKills={avgKillsStr}
                    averageTenMinKills={avgTenMinKillsStr}
                    matchCount={statsMatchCount}
                    teamId={team.id}
                    recentMatches={recentStats.matches as any[]}
                />
            )}


            {/* Roster Sections (OP.GG Style) - Now Editable */}
            {/* Roster Sections (OP.GG Style) - Now Editable */}
            <RosterEditor teamId={team.id} initialPlayers={team.players} />

            <TeamMatchHistoryClient
                teamId={team.id}
                tournaments={tournamentOptions}
                initialTournament={selectedTournament}
                matches={allMatches as any[]}
            />


        </div>
    );
}





