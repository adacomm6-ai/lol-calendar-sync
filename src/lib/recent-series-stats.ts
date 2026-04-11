export interface RecentSeriesGameLike {
    gameNumber: number;
    duration: number | null;
    totalKills: number | null;
    blueTenMinKills?: number | null;
    redTenMinKills?: number | null;
    winnerId: string | null;
}

export interface RecentSeriesMatchLike<TGame extends RecentSeriesGameLike = RecentSeriesGameLike> {
    format?: string | null;
    games: TGame[];
}

export function getExpectedSeriesGameCount(formatValue?: string | null): number {
    const formatText = String(formatValue || '').toUpperCase();
    const match = formatText.match(/BO\s*(\d+)/i) || formatText.match(/(\d+)/);
    const parsed = match ? parseInt(match[1], 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function getSeriesWinsNeeded(formatValue?: string | null): number {
    const expectedGames = getExpectedSeriesGameCount(formatValue);
    return Math.floor(expectedGames / 2) + 1;
}

export function getSeriesClinchGameNumber<TGame extends RecentSeriesGameLike>(
    formatValue: string | null | undefined,
    games: TGame[],
): number | null {
    const winsNeeded = getSeriesWinsNeeded(formatValue);
    const winsByTeam = new Map<string, number>();

    for (const game of games) {
        if (!game.winnerId) continue;
        const wins = (winsByTeam.get(game.winnerId) || 0) + 1;
        winsByTeam.set(game.winnerId, wins);

        if (wins >= winsNeeded) {
            return game.gameNumber;
        }
    }

    return null;
}

export function isPlaceholderGameAfterClinch<TGame extends RecentSeriesGameLike>(
    game: TGame,
    clinchedAtGameNumber: number | null,
): boolean {
    return (
        clinchedAtGameNumber !== null &&
        game.gameNumber > clinchedAtGameNumber &&
        game.duration === null &&
        game.totalKills === null
    );
}

export function getCompletedSeriesGames<TGame extends RecentSeriesGameLike>(
    formatValue: string | null | undefined,
    games: TGame[],
): TGame[] {
    const clinchedAtGameNumber = getSeriesClinchGameNumber(formatValue, games);
    return games.filter((game) => !isPlaceholderGameAfterClinch(game, clinchedAtGameNumber));
}

export function calculateRecentSeriesAverages<TGame extends RecentSeriesGameLike, TMatch extends RecentSeriesMatchLike<TGame>>(
    matches: TMatch[],
) {
    let totalSeconds = 0;
    let totalKills = 0;
    let totalGamesCount = 0;
    let totalTenMinKills = 0;
    let totalTenMinGamesCount = 0;

    const sanitizedMatches = matches.map((match) => {
        const completedGames = getCompletedSeriesGames(match.format, match.games);

        completedGames.forEach((game) => {
            if (game.duration !== null && game.duration !== undefined) {
                totalSeconds += game.duration;
                totalGamesCount += 1;
            }
            if (game.totalKills !== null && game.totalKills !== undefined) {
                totalKills += game.totalKills;
            }

            const hasBlueTenMin = game.blueTenMinKills !== null && game.blueTenMinKills !== undefined;
            const hasRedTenMin = game.redTenMinKills !== null && game.redTenMinKills !== undefined;
            if (hasBlueTenMin && hasRedTenMin) {
                totalTenMinKills += Number(game.blueTenMinKills) + Number(game.redTenMinKills);
                totalTenMinGamesCount += 1;
            }
        });

        return {
            ...match,
            games: completedGames,
        };
    }) as TMatch[];

    if (totalGamesCount === 0) {
        return {
            duration: null as string | null,
            kills: null as string | null,
            tenMinKills: null as string | null,
            totalGamesCount: 0,
            totalTenMinGamesCount: 0,
            matches: sanitizedMatches,
        };
    }

    const avgSeconds = Math.floor(totalSeconds / totalGamesCount);
    const min = Math.floor(avgSeconds / 60);
    const sec = avgSeconds % 60;

    return {
        duration: `${min}:${sec.toString().padStart(2, '0')}`,
        kills: (totalKills / totalGamesCount).toFixed(1),
        tenMinKills: totalTenMinGamesCount > 0 ? (totalTenMinKills / totalTenMinGamesCount).toFixed(1) : null,
        totalGamesCount,
        totalTenMinGamesCount,
        matches: sanitizedMatches,
    };
}
