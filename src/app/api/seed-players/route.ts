
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        console.log("Starting LCK 2026 Player & Logo Seeding...");

        const teamsData = [
            {
                name: "BNK FEARX",
                shortName: "FOX",
                logo: "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/5/5b/BNK_FEARXlogo_square.png/revision/latest/scale-to-width-down/123?cb=20260102063007",
                players: { top: "Clear", jng: "Raptor", mid: "Daystar", bot: "Diable", sup: "Kellin" }
            },
            {
                name: "DN SOOPers",
                shortName: "DNS",
                logo: "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/8/8c/DN_SOOPerslogo_square.png/revision/latest/scale-to-width-down/123?cb=20251222013110",
                players: { top: "DuDu", jng: "Pyosik", mid: "Clozer", bot: "deokdam", sup: "Life" }
            },
            {
                name: "Dplus KIA",
                shortName: "DK",
                logo: "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/73/Dplus_KIAlogo_square.png/revision/latest/scale-to-width-down/123?cb=20230512050104",
                players: { top: "Siwoo", jng: "Lucid", mid: "ShowMaker", bot: "Smash", sup: "Career" }
            },
            {
                name: "KRX",
                shortName: "KRX",
                logo: "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/d/d3/DRXlogo_square.png/revision/latest/scale-to-width-down/123?cb=20230504052321",
                players: { top: "Rich", jng: "Vincenzo", mid: "Ucal", bot: "Jiwoo", sup: "Andil" }
            },
            {
                name: "Gen.G",
                shortName: "GEN",
                logo: "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/e/e3/Gen.Glogo_square.png/revision/latest/scale-to-width-down/123?cb=20210325073128",
                players: { top: "Kiin", jng: "Canyon", mid: "Chovy", bot: "Ruler", sup: "Duro" }
            },
            {
                name: "HANJIN BRION",
                shortName: "BRO",
                logo: "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/c/cf/BRIONlogo_square.png/revision/latest/scale-to-width-down/123?cb=20230518062717",
                players: { top: "Casting", jng: "GIDEON", mid: "Fisher", bot: "Roamer", sup: "Namgung" }
            },
            {
                name: "Hanwha Life Esports",
                shortName: "HLE",
                logo: "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/a/a6/Hanwha_Life_Esportslogo_square.png/revision/latest/scale-to-width-down/123?cb=20211024145058",
                players: { top: "Zeus", jng: "Kanavi", mid: "Zeka", bot: "Gumayusi", sup: "Delight" }
            },
            {
                name: "KT Rolster",
                shortName: "KT",
                logo: "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/f/f8/KT_Rolsterlogo_square.png/revision/latest/scale-to-width-down/123?cb=20260105105530",
                players: { top: "PerfecT", jng: "Cuzz", mid: "Bdd", bot: "Aiming", sup: "Ghost" }
            },
            {
                name: "Nongshim RedForce",
                shortName: "NS",
                logo: "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/b/b8/Nongshim_RedForcelogo_square.png/revision/latest/scale-to-width-down/123?cb=20260109024521",
                players: { top: "Kingen", jng: "Sponge", mid: "Scout", bot: "Calix", sup: "Taeyoon" }
            },
            {
                name: "T1",
                shortName: "T1",
                logo: "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/a/a2/T1logo_square.png/revision/latest/scale-to-width-down/123?cb=20230512040747",
                players: { top: "Doran", jng: "Oner", mid: "Faker", bot: "Peyz", sup: "Keria" }
            }
        ];

        let updatedTeams = 0;
        let createdPlayers = 0;

        for (const t of teamsData) {
            // 1. Update/Upsert Team
            // We search by name OR shortName to be safe, but since valid LCK teams are usually seeded by name, we stick to name.
            // Some names might have changed (e.g. OKSavingsBank BRION -> HANJIN BRION).
            // We try to find by shortName if provided, otherwise name.

            let team = await prisma.team.findFirst({
                where: {
                    OR: [
                        { name: t.name },
                        { shortName: t.shortName }
                    ]
                }
            });

            if (team) {
                // Update existing team
                team = await prisma.team.update({
                    where: { id: team.id },
                    data: {
                        name: t.name, // Ensure name is current
                        logo: t.logo,
                        shortName: t.shortName
                    }
                });
                updatedTeams++;
            } else {
                // Create new team
                team = await prisma.team.create({
                    data: {
                        name: t.name,
                        shortName: t.shortName,
                        region: "LCK",
                        logo: t.logo
                    }
                });
                updatedTeams++;
            }

            // 2. Manage Players
            // Strategy: Clear existing players for this team to avoid duplicates, then insert current roster.
            await prisma.player.deleteMany({
                where: { teamId: team.id }
            });

            const roles = {
                "TOP": t.players.top,
                "JUNGLE": t.players.jng,
                "MID": t.players.mid,
                "ADC": t.players.bot,
                "SUPPORT": t.players.sup
            };

            for (const [role, name] of Object.entries(roles)) {
                if (name) {
                    await prisma.player.create({
                        data: {
                            name,
                            role,
                            teamId: team.id,
                            split: "2026 Season Cup"
                        }
                    });
                    createdPlayers++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: `Updated/Created ${updatedTeams} teams and seeding ${createdPlayers} players.`,
            details: teamsData.map(t => `${t.name}: ${Object.values(t.players).join(', ')}`)
        });

    } catch (e: any) {
        console.error("Seeding Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
