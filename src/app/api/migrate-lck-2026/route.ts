
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        console.log("Starting LCK 2026 migration...");

        // 1. Upsert Teams
        const teams = [
            { name: "T1", shortName: "T1", region: "LCK", logo: "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2Ft1-full-on-dark.png" },
            { name: "Gen.G", shortName: "GEN", region: "LCK", logo: "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1704375161752_GenG_Logo_2024_Star_PNG.png" },
            { name: "Hanwha Life Esports", shortName: "HLE", region: "LCK", logo: "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1631819669146_HLE_2021_Square.png" },
            { name: "Dplus KIA", shortName: "DK", region: "LCK", logo: "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1673260752538_Dplus_KIA_Logo.png" },
            { name: "KT Rolster", shortName: "KT", region: "LCK", logo: "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2Fkt-full-on-dark.png" },
            { name: "DN SOOPers", shortName: "DNS", region: "LCK", logo: "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1641290497554_KDF_logo.png" }, // Rebranded from KDF, pending new logo URL
            { name: "KRX", shortName: "KRX", region: "LCK", logo: "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1673007077978_DRX_Logo_2023.png" },
            { name: "FearX", shortName: "FOX", region: "LCK", logo: "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1704620436449_FearX.png" },
            { name: "Nongshim RedForce", shortName: "NS", region: "LCK", logo: "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1608277252033_ns-redforce-logo.png" },
            { name: "OKSavingsBank BRION", shortName: "BRO", region: "LCK", logo: "https://am-a.akamaihd.net/image?resize=70:&f=http%3A%2F%2Fstatic.lolesports.com%2Fteams%2F1672909772671_BRO_Green_Logo.png" },
        ];

        for (const t of teams) {
            await prisma.team.upsert({
                where: { name: t.name },
                update: { ...t },
                create: { ...t },
            });
        }

        // 2. Clear existing LCK 2026 matches to avoid duplicates
        await prisma.match.deleteMany({ where: { tournament: "2026 LCK Cup" } });

        // 3. Create Matches
        // Helper to get ID
        const getId = async (name: string) => {
            const t = await prisma.team.findFirst({ where: { name } });
            return t?.id;
        };

        const t1 = await getId("T1");
        const gen = await getId("Gen.G");
        const hle = await getId("Hanwha Life Esports");
        const dk = await getId("Dplus KIA");
        const kt = await getId("KT Rolster");
        const dns = await getId("DN SOOPers");
        const krx = await getId("KRX");
        const fox = await getId("FearX");
        const ns = await getId("Nongshim RedForce");
        const bro = await getId("OKSavingsBank BRION");

        const matches = [
            // Week 1 (BO3)
            { time: "2026-01-14T16:00:00", teamA: kt, teamB: dns, format: "BO3" },
            { time: "2026-01-14T18:00:00", teamA: dk, teamB: bro, format: "BO3" },
            { time: "2026-01-15T16:00:00", teamA: gen, teamB: krx, format: "BO3" },
            { time: "2026-01-15T18:00:00", teamA: fox, teamB: ns, format: "BO3" },
            { time: "2026-01-16T16:00:00", teamA: dns, teamB: dk, format: "BO3" },
            { time: "2026-01-16T18:00:00", teamA: hle, teamB: t1, format: "BO3" },
            { time: "2026-01-17T16:00:00", teamA: bro, teamB: fox, format: "BO3" },
            { time: "2026-01-17T18:00:00", teamA: gen, teamB: kt, format: "BO3" },
            { time: "2026-01-18T16:00:00", teamA: ns, teamB: hle, format: "BO3" },
            { time: "2026-01-18T18:00:00", teamA: krx, teamB: t1, format: "BO3" },

            // Week 2 (BO3)
            { time: "2026-01-21T16:00:00", teamA: dk, teamB: ns, format: "BO3" },
            { time: "2026-01-21T18:00:00", teamA: krx, teamB: dns, format: "BO3" },
            { time: "2026-01-22T16:00:00", teamA: bro, teamB: hle, format: "BO3" },
            { time: "2026-01-22T18:00:00", teamA: fox, teamB: gen, format: "BO3" },
            { time: "2026-01-23T16:00:00", teamA: kt, teamB: t1, format: "BO3" },
            { time: "2026-01-23T18:00:00", teamA: ns, teamB: krx, format: "BO3" },
            { time: "2026-01-24T16:00:00", teamA: hle, teamB: dns, format: "BO3" },
            { time: "2026-01-24T18:00:00", teamA: dk, teamB: gen, format: "BO3" },
            { time: "2026-01-25T16:00:00", teamA: t1, teamB: fox, format: "BO3" },
            { time: "2026-01-25T18:00:00", teamA: kt, teamB: bro, format: "BO3" },

            // Week 3 (BO5)
            { time: "2026-01-28T16:00:00", teamA: bro, teamB: krx, format: "BO5" },
            { time: "2026-01-29T16:00:00", teamA: dns, teamB: fox, format: "BO5" },
            { time: "2026-01-30T16:00:00", teamA: ns, teamB: kt, format: "BO5" },
            { time: "2026-01-31T16:00:00", teamA: t1, teamB: dk, format: "BO5" },
            { time: "2026-02-01T16:00:00", teamA: hle, teamB: gen, format: "BO5" },
        ];

        let count = 0;
        for (const m of matches) {
            if (m.teamA && m.teamB) {
                // Since we deleted all, just create
                await prisma.match.create({
                    data: {
                        teamAId: m.teamA,
                        teamBId: m.teamB,
                        startTime: new Date(m.time),
                        tournament: "2026 LCK Cup",
                        stage: "Group Stage",
                        format: m.format,
                        status: "SCHEDULED"
                    }
                });
                count++;
            }
        }

        return NextResponse.json({ success: true, message: `Migrated ${teams.length} teams and ${count} matches for LCK Cup.` });

    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
