
const ENDPOINT = "https://lol.fandom.com/api.php";

async function fetchWithRetry(url: string, retries = 5, backoff = 2000): Promise<any> {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                cache: 'no-store'
            });
            const data = await res.json();

            // Check for MediaWiki Error format
            if (data.error && data.error.code === 'ratelimited') {
                console.warn(`[Leaguepedia] Rate Limited. Retrying in ${backoff}ms... (${i + 1}/${retries})`);
                if (i === retries) throw new Error("Rate Limit Exceeded after retries");
                await new Promise(r => setTimeout(r, backoff));
                backoff *= 2; // Exponential backoff
                continue;
            }

            return data;
        } catch (e: unknown) {
            const error = e as Error;
            // If manual throw above, rethrow
            if (error.message && error.message.includes("Rate Limit Exceeded")) throw error;

            if (i === retries) throw error;
            console.warn(`[Leaguepedia] Request Failed (${error.message}). Retrying... (${i + 1}/${retries})`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
}

export interface LeaguepediaMatch {
    matchId: string;
    date: string; // UTC
    team1: string;
    team2: string;
    tournament: string;
    winner: number; // 1 or 2
    gameId: string;
    gameNumber: number;
    vod?: string;
    team1Bans?: string[];
    team2Bans?: string[];
}

export interface LeaguepediaPlayer {
    name: string;
    champion: string;
    kills: number;
    deaths: number;
    assists: number;
    damage: number;
    cs: number;
    team: string; // Team Name
    role: string;
}

export async function fetchDailyMatches(dateInput: Date | string): Promise<LeaguepediaMatch[]> {
    // Robustly handle Date or String
    let dateStr = "";
    if (typeof dateInput === 'string') {
        dateStr = dateInput;
    } else {
        dateStr = dateInput.toISOString().split('T')[0];
    }

    // USER REQUEST: Match "Beijing Time" Day
    // Beijing is UTC+8.
    // Beijing 00:00 = UTC Prev Day 16:00
    // Beijing 23:59 = UTC Current Day 15:59
    // We construct the ISO strings manually for the query.

    const beijingMidnight = new Date(`${dateStr}T00:00:00+08:00`);
    const beijingEnd = new Date(`${dateStr}T23:59:59+08:00`);

    // Convert to "YYYY-MM-DD HH:mm:ss" UTC format for Cargo
    const toCargoUTC = (d: Date) => {
        return d.toISOString().replace('T', ' ').substring(0, 19);
    };

    const start = toCargoUTC(beijingMidnight);
    const end = toCargoUTC(beijingEnd);

    console.log(`[Leaguepedia] Fetching matches for Beijing Date ${dateStr} (UTC Range: ${start} to ${end})`);

    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardGames=SG",
        // Added Team1Bans, Team2Bans
        fields: "SG.Tournament=Tournament, SG.Team1=Team1, SG.Team2=Team2, SG.DateTime_UTC=DateTimeUTC, SG.Winner=Winner, SG.Gamelength=Gamelength, SG.MatchId=MatchId, SG.GameId=GameId, SG.N_GameInMatch=GameNumber, SG.VOD=VOD, SG.Team1Bans=Team1Bans, SG.Team2Bans=Team2Bans",
        where: `SG.DateTime_UTC >= '${start}' AND SG.DateTime_UTC <= '${end}' AND (SG.Tournament LIKE '%LPL%' OR SG.Tournament LIKE '%LCK%')`, // Target LPL/LCK
        limit: "50",
        order_by: "SG.DateTime_UTC"
    });

    try {
        const data = await fetchWithRetry(`${ENDPOINT}?${params.toString()}`);
        if (!data.cargoquery) return [];

        return data.cargoquery.map((item: any) => {
            const g = item.title;
            // Parse Bans (pipe separated or comma? usually pipe in database, but let's check. Assuming string and splitting usually safe)
            // Cargo usually returns list separated by something.
            const parseBans = (str: string) => str ? str.split(',') : [];

            return {
                matchId: g.MatchId,
                date: g.DateTimeUTC,
                team1: g.Team1,
                team2: g.Team2,
                tournament: g.Tournament,
                winner: parseInt(g.Winner),
                gameId: g.GameId,
                gameNumber: parseInt(g.GameNumber),
                vod: g.VOD,
                team1Bans: parseBans(g.Team1Bans),
                team2Bans: parseBans(g.Team2Bans)
            };
        });
    } catch (e) {
        console.error("Leaguepedia Query Error:", e);
        return [];
    }
}

export async function fetchPlayersForGames(gameIds: string[]): Promise<Record<string, LeaguepediaPlayer[]>> {
    if (gameIds.length === 0) return {};

    const quotedIds = gameIds.map(id => `'${id.replace(/'/g, "\\'")}'`).join(',');
    const where = `SP.GameId IN (${quotedIds})`;

    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardPlayers=SP",
        fields: "SP.Name, SP.Champion, SP.Kills, SP.Deaths, SP.Assists, SP.DamageToChampions, SP.Team, SP.Role, SP.CS, SP.GameId",
        where: where,
        limit: "500"
    });

    console.log(`[Leaguepedia] Batch fetching players for ${gameIds.length} games...`);

    try {
        const data = await fetchWithRetry(`${ENDPOINT}?${params.toString()}`);

        if (!data.cargoquery) {
            console.error("[Leaguepedia] No cargoquery in batch response");
            return {};
        }

        console.log(`[Leaguepedia] Batch found ${data.cargoquery.length} total player records.`);

        const resultMap: Record<string, LeaguepediaPlayer[]> = {};

        // Initialize arrays
        gameIds.forEach(id => resultMap[id] = []);

        // LOG RAW DATA SAMPLE (First 2)
        if (data.cargoquery.length > 0) {
            console.log("[Leaguepedia Debug] Raw Player Data Sample:", JSON.stringify(data.cargoquery[0], null, 2));
        }

        data.cargoquery.forEach((item: { title: any }) => {
            const p = item.title;
            const gameId = (p.GameId || p.gameid) as string;

            // Robust property access
            const getVal = (obj: any, keys: string[]): string | null => {
                for (const k of keys) {
                    if (obj[k] !== undefined) return obj[k];
                }
                return null;
            };

            const player: LeaguepediaPlayer = {
                name: getVal(p, ['Name', 'name']) || 'Unknown',
                champion: getVal(p, ['Champion', 'champion']) || 'Unknown',
                kills: parseInt(getVal(p, ['Kills', 'kills']) || '0'),
                deaths: parseInt(getVal(p, ['Deaths', 'deaths']) || '0'),
                assists: parseInt(getVal(p, ['Assists', 'assists']) || '0'),
                damage: parseInt(getVal(p, ['DamageToChampions', 'damagetochampions', 'Damage']) || '0'),
                cs: parseInt(getVal(p, ['CS', 'cs']) || '0'),
                team: getVal(p, ['Team', 'team']) || 'Unknown',
                role: getVal(p, ['Role', 'role']) || 'Unknown'
            };

            if (resultMap[gameId]) {
                resultMap[gameId].push(player);
            }
        });

        return resultMap;

    } catch (e) {
        console.error("Leaguepedia Batch Query Error:", e);
        return {};
    }
}

export async function fetchTournamentMatches(tournamentName: string): Promise<LeaguepediaMatch[]> {
    console.log(`[Leaguepedia] Fetching future matches for tournament: ${tournamentName}`);

    // Get current time in UTC
    const nowUTC = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardGames=SG",
        fields: "SG.Tournament=Tournament, SG.Team1=Team1, SG.Team2=Team2, SG.DateTime_UTC=DateTimeUTC, SG.Winner=Winner, SG.Gamelength=Gamelength, SG.MatchId=MatchId, SG.GameId=GameId, SG.N_GameInMatch=GameNumber, SG.VOD=VOD, SG.Team1Bans=Team1Bans, SG.Team2Bans=Team2Bans",
        where: `SG.Tournament='${tournamentName}' AND SG.DateTime_UTC >= '${nowUTC}'`,
        limit: "50",
        order_by: "SG.DateTime_UTC"
    });

    try {
        const data = await fetchWithRetry(`${ENDPOINT}?${params.toString()}`);
        if (!data.cargoquery) return [];

        return data.cargoquery.map((item: any) => {
            const g = item.title;
            const parseBans = (str: string) => str ? str.split(',') : [];

            return {
                matchId: g.MatchId,
                date: g.DateTimeUTC,
                team1: g.Team1,
                team2: g.Team2,
                tournament: g.Tournament,
                winner: parseInt(g.Winner),
                gameId: g.GameId,
                gameNumber: parseInt(g.GameNumber),
                vod: g.VOD,
                team1Bans: parseBans(g.Team1Bans),
                team2Bans: parseBans(g.Team2Bans)
            };
        });
    } catch (e) {
        console.error("Leaguepedia Tournament Query Error:", e);
        return [];
    }
}

/**
 * Fetch ALL matches for a specific tournament, bypassing the 500 limit via pagination.
 * This is used for the Sync Full Tournament feature.
 */
export async function fetchAllTournamentMatches(tournamentName: string): Promise<LeaguepediaMatch[]> {
    console.log(`[Leaguepedia] Fetching ALL matches for tournament: ${tournamentName}`);

    let allMatches: LeaguepediaMatch[] = [];
    let offset = 0;
    const limit = 500;
    let hasMore = true;

    while (hasMore) {
        const params = new URLSearchParams({
            action: "cargoquery",
            format: "json",
            tables: "ScoreboardGames=SG",
            fields: "SG.Tournament=Tournament, SG.Team1=Team1, SG.Team2=Team2, SG.DateTime_UTC=DateTimeUTC, SG.Winner=Winner, SG.Gamelength=Gamelength, SG.MatchId=MatchId, SG.GameId=GameId, SG.N_GameInMatch=GameNumber, SG.VOD=VOD, SG.Team1Bans=Team1Bans, SG.Team2Bans=Team2Bans",
            where: `SG.Tournament='${tournamentName.replace(/'/g, "\\'")}'`,
            limit: limit.toString(),
            offset: offset.toString(),
            order_by: "SG.DateTime_UTC ASC"
        });

        try {
            console.log(`[Leaguepedia] Fetching batch at offset ${offset}...`);
            const data = await fetchWithRetry(`${ENDPOINT}?${params.toString()}`);

            if (!data.cargoquery || data.cargoquery.length === 0) {
                hasMore = false;
                break;
            }

            const batch = data.cargoquery.map((item: any) => {
                const g = item.title;
                const parseBans = (str: string) => str ? str.split(',') : [];

                return {
                    matchId: g.MatchId,
                    date: g.DateTimeUTC,
                    team1: g.Team1,
                    team2: g.Team2,
                    tournament: g.Tournament,
                    winner: parseInt(g.Winner),
                    gameId: g.GameId,
                    gameNumber: parseInt(g.GameNumber),
                    vod: g.VOD,
                    team1Bans: parseBans(g.Team1Bans),
                    team2Bans: parseBans(g.Team2Bans)
                };
            });

            allMatches = allMatches.concat(batch);

            if (data.cargoquery.length < limit) {
                hasMore = false;
            } else {
                offset += limit;
                // Minor backoff 
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (e) {
            console.error("Leaguepedia Full Tournament Query Error at offset", offset, e);
            hasMore = false; // abort on error to save partial
        }
    }

    console.log(`[Leaguepedia] Finished fetching. Total games found: ${allMatches.length}`);
    return allMatches;
}

export interface LeaguepediaRosterPlayer {
    id: string; // The player ID (nickname)
    role: string;
    image: string; // Filename for their photo
}

/**
 * Fetch current roster for a team from Leaguepedia
 */
export async function fetchTeamRoster(teamName: string): Promise<LeaguepediaRosterPlayer[]> {
    console.log(`[Leaguepedia] Fetching roster for team: ${teamName}`);

    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "Players=P",
        fields: "P.ID=ID, P.Role=Role, P.Image=Image",
        where: `P.Team='${teamName.replace(/'/g, "\\'")}' AND P.IsPlayer=1`,
        limit: "20"
    });

    try {
        const data = await fetchWithRetry(`${ENDPOINT}?${params.toString()}`);
        if (!data.cargoquery) return [];

        return data.cargoquery.map((item: any) => ({
            id: item.title.ID,
            role: item.title.Role,
            image: item.title.Image
        }));
    } catch (e) {
        console.error("Leaguepedia Roster Query Error:", e);
        return [];
    }
}

export async function resolveTournament(input: string): Promise<string> {
    // Check if input is a URL
    if (input.includes('lol.fandom.com/wiki/')) {
        try {
            // Extract Page Title from URL
            // e.g. https://lol.fandom.com/wiki/LPL/2026_Season/Spring_Season
            const parts = input.split('/wiki/');
            if (parts.length < 2) return input; // Fallback

            let pageTitle = decodeURIComponent(parts[1]).replace(/_/g, ' ');

            console.log(`[Leaguepedia] Resolving URL '${input}' -> Title '${pageTitle}'`);

            // Query Tournaments table to get the "Name" (Standard Name) used in ScoreboardGames
            // OverviewPage field matches the wiki page title
            const params = new URLSearchParams({
                action: "cargoquery",
                format: "json",
                tables: "Tournaments=T",
                fields: "T.Name=Name",
                where: `T.OverviewPage='${pageTitle}'`,
                limit: "1"
            });

            const data = await fetchWithRetry(`${ENDPOINT}?${params.toString()}`);
            if (data.cargoquery && data.cargoquery.length > 0) {
                const name = data.cargoquery[0].title.Name;
                console.log(`[Leaguepedia] Resolved to Tournament Name: '${name}'`);
                return name;
            } else {
                console.warn(`[Leaguepedia] Could not resolve URL '${input}' to a Tournament Name via Cargo. Using title as name.`);
                return pageTitle;
            }
        } catch (e) {
            console.error("[Leaguepedia] Error resolving URL:", e);
            return input;
        }
    }
    return input;
}

/**
 * 淘汰赛专用查询方法：拉取指定赛事的所有已完成对局并按 Series 聚合返回。
 * 与 fetchAllTournamentMatches 不同的是，这个方法返回的是按 MatchId 分组后的 Series 级数据，
 * 附带每个 Series 的 stage 关键信息，便于与本地 TBD 空壳进行拓扑匹配。
 */
export interface PlayoffSeriesResult {
    matchId: string;
    date: string;
    team1: string;
    team2: string;
    tournament: string;
    winner: string; // 胜方队伍名
    gameCount: number;
    /** Leaguepedia MatchId 中通常嵌入了阶段描述，如 "LPL/2026 Season/Split 1 Playoffs_R1_M1" */
    rawMatchId: string;
}

export async function fetchPlayoffResults(tournamentName: string): Promise<PlayoffSeriesResult[]> {
    console.log(`[Leaguepedia] Fetching playoff results for: ${tournamentName}`);

    // 使用全量轮询方法获取所有对局（无论是否已完成）
    const allGames = await fetchAllTournamentMatches(tournamentName);
    if (!allGames || allGames.length === 0) {
        console.warn(`[Leaguepedia] No games found for playoff tournament: ${tournamentName}`);
        return [];
    }

    // 按 MatchId（Series）分组
    const seriesMap = new Map<string, LeaguepediaMatch[]>();
    allGames.forEach(g => {
        if (!seriesMap.has(g.matchId)) {
            seriesMap.set(g.matchId, []);
        }
        seriesMap.get(g.matchId)!.push(g);
    });

    const results: PlayoffSeriesResult[] = [];

    for (const [matchId, games] of seriesMap.entries()) {
        // 取第一场的基础信息
        const first = games[0];

        // 只返回已完成的 Series（winner > 0 的场次）
        const finishedGames = games.filter(g => g.winner > 0);
        if (finishedGames.length === 0) continue;

        // 计算 Series 胜方
        const team1Wins = finishedGames.filter(g => g.winner === 1).length;
        const team2Wins = finishedGames.filter(g => g.winner === 2).length;
        const seriesWinner = team1Wins > team2Wins ? first.team1 : first.team2;

        results.push({
            matchId: `playoff_${matchId}`,
            date: first.date,
            team1: first.team1,
            team2: first.team2,
            tournament: first.tournament,
            winner: seriesWinner,
            gameCount: finishedGames.length,
            rawMatchId: matchId
        });
    }

    // 按时间排序
    results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    console.log(`[Leaguepedia] Found ${results.length} completed playoff series.`);
    return results;
}
