import { prisma } from "@/lib/db";
import { normalizeRole, normalizeText } from '@/lib/player-snapshot';
import { normalizeTeamFamilyKey, normalizeTeamIdentityKey } from '@/lib/team-alias';

function isSampleTournamentLike(value: unknown) {
    return normalizeText(value).includes('本地样本');
}

function isPlaceholderPlayerName(value: unknown) {
    const raw = normalizeText(value);
    if (!raw) return true;
    if (/^[A-Za-z]\d{1,2}$/.test(raw)) return true;
    if (raw.includes('候选')) return true;
    return false;
}

export async function upsertPlayersFromStats(teamId: string | null, tournament: string | null, playersStats: any[]) {
    if (!teamId || !playersStats || playersStats.length === 0) return;
    if (isSampleTournamentLike(tournament)) return;

    try {
        const targetTeam = await prisma.team.findUnique({ where: { id: teamId } });
        if (!targetTeam) return;
        const targetTeamKey = normalizeTeamIdentityKey(targetTeam.name, targetTeam.shortName);
        const targetFamilyKey = normalizeTeamFamilyKey(targetTeam.name, targetTeam.shortName);

        for (const playerStat of playersStats) {
            // Usually the name might be "player.name" or "player.playerName" depending on formatting
            const name = normalizeText(playerStat.name || playerStat.playerName);
            const role = normalizeRole(playerStat.role || "Unknown");

            if (!name || isPlaceholderPlayerName(name)) continue;

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
                const sameNameCandidates = await prisma.player.findMany({
                    where: { name },
                    include: { team: true },
                });

                const sameTeamAliasCandidate = sameNameCandidates.find((candidate) => {
                    const candidateRole = normalizeRole(candidate.role);
                    const candidateTeamKey = normalizeTeamIdentityKey(candidate.team?.name || '', candidate.team?.shortName || '');
                    return candidateRole === role && candidateTeamKey === targetTeamKey;
                });

                if (sameTeamAliasCandidate) {
                    const newSplit = sameTeamAliasCandidate.split
                        ? `${sameTeamAliasCandidate.split}, ${splitKeyword}`
                        : splitKeyword;

                    await prisma.player.update({
                        where: { id: sameTeamAliasCandidate.id },
                        data: {
                            teamId,
                            role,
                            split: newSplit,
                        },
                    });
                    continue;
                }

                const sameFamilyCandidate = sameNameCandidates.find((candidate) => {
                    const candidateRole = normalizeRole(candidate.role);
                    const candidateFamilyKey = normalizeTeamFamilyKey(candidate.team?.name || '', candidate.team?.shortName || '');
                    return candidateRole === role && candidateFamilyKey === targetFamilyKey;
                });

                if (sameFamilyCandidate) {
                    const newSplit = sameFamilyCandidate.split
                        ? `${sameFamilyCandidate.split}, ${splitKeyword}`
                        : splitKeyword;

                    await prisma.player.update({
                        where: { id: sameFamilyCandidate.id },
                        data: {
                            teamId,
                            role,
                            split: newSplit,
                        },
                    });
                    continue;
                }

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
