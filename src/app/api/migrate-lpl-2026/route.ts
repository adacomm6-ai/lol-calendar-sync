
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// Raw schedule string layout
const rawSchedule = `2026年1月14日
WBG对战IG
TES对战JDG
2026年1月15日
LGD对战UP
IG对战AL
WBG对战BLG
2026年1月16日
LNG对战UP
WE对战EDG
2026年1月17日
BLG对战AL
JDG对战IG
2026年1月18日
TES对战BLG
AL对战JDG
2026年1月19日
TT对战WE
TES对战WBG
EDG对战NIP
2026年1月20日
AL对战WBG
IG对战BLG
2026年1月21日
LNG对战LGD
IG对战TES
2026年1月22日
OMG对战UP
TT对战EDG
WE对战NIP
2026年1月23日
OMG对战LGD
EDG对战TT
JDG对战BLG
2026年1月24日
TES对战AL
WBG对战JDG
2026年1月25日
NIP对战WE
TES对战IG
2026年1月26日
WE对战TT
BLG对战JDG
2026年1月27日
UP对战LNG
WBG对战TES
AL对战IG
2026年1月28日
UP对战LGD
OMG对战LNG
NIP对战EDG
2026年1月29日
TT对战NIP
JDG对战WBG
2026年1月30日
UP对战OMG
BLG对战TES
2026年1月31日
JDG对战AL
BLG对战IG
2026年2月1日
LGD对战LNG
AL对战TES
2026年2月2日
LGD对战OMG
BLG对战WBG
2026年2月3日
LNG对战OMG
IG对战JDG
2026年2月4日
EDG对战WE
WBG对战AL
2026年2月5日
NIP对战TT
JDG对战TES
2026年2月6日
IG对战WBG
AL对战BLG`;

export async function GET() {
    try {
        const lines = rawSchedule.split('\n').map(l => l.trim()).filter(l => l);
        let currentDateStr = '';
        const matchesToInsert = [];

        // Pre-fetch all teams to map shortNames/Names to IDs
        const teams = await prisma.team.findMany();
        const teamMap = new Map<string, string>();

        teams.forEach(t => {
            teamMap.set(t.name.toUpperCase(), t.id);
            if (t.shortName) teamMap.set(t.shortName.toUpperCase(), t.id);
            // Also add a simplified fallback mapping if needed, e.g. "WBG" might naturally match shortName
        });

        // Mapping function helper
        const getTeamId = (name: string) => {
            // Try direct match
            if (teamMap.has(name.toUpperCase())) return teamMap.get(name.toUpperCase());
            // Try containing match if direct fails (dangerous but maybe necessary if "WBG" vs "Weibo Gaming")
            // For now assume shortNames are aligned or we added them.
            // We know our DB has: JDG, LNG, NIP, WBG, BLG, TES, EDG, RNG, OMG, WE, LGD, AL, UP, IG, TT, RA, FPX
            // All user provided names look like shortnames.
            return null;
        };

        let currentDayMatchCount = 0;

        for (const line of lines) {
            // Check if it's a date line: "2026年1月14日"
            if (line.includes('年') && line.includes('月') && line.includes('日')) {
                currentDateStr = line;
                currentDayMatchCount = 0;
                continue;
            }

            // Match line: "WBG对战IG"
            if (line.includes('对战')) {
                const [teamAName, teamBName] = line.split('对战').map(s => s.trim());
                if (!teamAName || !teamBName) continue;

                const teamAId = getTeamId(teamAName);
                const teamBId = getTeamId(teamBName);

                if (!teamAId || !teamBId) {
                    console.log(`Skipping match ${line}: Team not found (${teamAName}: ${teamAId}, ${teamBName}: ${teamBId})`);
                    continue;
                }

                // Parse Date
                // "2026年1月14日"
                const dateParts = currentDateStr.match(/(\d+)年(\d+)月(\d+)日/);
                if (!dateParts) continue;

                const year = parseInt(dateParts[1]);
                const month = parseInt(dateParts[2]) - 1; // JS months are 0-indexed
                const day = parseInt(dateParts[3]);

                // Set times: Match 1 = 17:00, Match 2 = 19:00, Match 3 = 21:00 (approx)
                // LPL usually 17:00 and 19:00.
                let hour = 17;
                if (currentDayMatchCount === 1) hour = 19;
                if (currentDayMatchCount === 2) hour = 21; // Rare triple headers

                const startTime = new Date(year, month, day, hour, 0, 0);

                matchesToInsert.push({
                    teamAId,
                    teamBId,
                    startTime,
                    tournament: '2026 LPL第一赛段',
                    stage: 'Regular Season',
                    format: 'BO3',
                    status: 'SCHEDULED'
                });

                currentDayMatchCount++;
            }
        }

        // Insert matches
        console.log(`Found ${matchesToInsert.length} matches to insert.`);

        const results = [];
        for (const m of matchesToInsert) {
            // Check existence to avoid dupes?
            // Simple check: same teams same day.
            const exists = await prisma.match.findFirst({
                where: {
                    teamAId: m.teamAId,
                    teamBId: m.teamBId,
                    startTime: m.startTime
                }
            });

            if (!exists) {
                const newMatch = await prisma.match.create({ data: m });
                results.push(newMatch);
            }
        }

        return NextResponse.json({ success: true, inserted: results.length, matches: results });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
    }
}
