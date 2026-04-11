const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const teamsData = [
    {
        name: "T1",
        shortName: "T1",
        region: "LCK",
        players: [
            { name: "Doran", role: "TOP" },
            { name: "Oner", role: "JUNGLE" },
            { name: "Faker", role: "MID" },
            { name: "Peyz", role: "ADC" },
            { name: "Keria", role: "SUPPORT" },
            { name: "kkOma", role: "COACH" },
            { name: "Tom", role: "COACH" },
            { name: "Mata", role: "COACH" }
        ]
    },
    {
        name: "Gen.G",
        shortName: "GEN",
        region: "LCK",
        players: [
            { name: "Kiin", role: "TOP" },
            { name: "Canyon", role: "JUNGLE" },
            { name: "Chovy", role: "MID" },
            { name: "Ruler", role: "ADC" },
            { name: "Duro", role: "SUPPORT" },
            { name: "Ryu", role: "COACH" },
            { name: "Lyn", role: "COACH" }
        ]
    },
    {
        name: "Hanwha Life Esports",
        shortName: "HLE",
        region: "LCK",
        players: [
            { name: "Zeus", role: "TOP" },
            { name: "Kanavi", role: "JUNGLE" },
            { name: "Zeka", role: "MID" },
            { name: "Gumayusi", role: "ADC" },
            { name: "Delight", role: "SUPPORT" },
            { name: "Homme", role: "COACH" }
        ]
    },
    {
        name: "Dplus KIA",
        shortName: "DK",
        region: "LCK",
        players: [
            { name: "Siwoo", role: "TOP" },
            { name: "Lucid", role: "JUNGLE" },
            { name: "ShowMaker", role: "MID" },
            { name: "Smash", role: "ADC" },
            { name: "Career", role: "SUPPORT" },
            { name: "cvMax", role: "COACH" }
        ]
    },
    {
        name: "KT Rolster",
        shortName: "KT",
        region: "LCK",
        players: [
            { name: "PerfecT", role: "TOP" },
            { name: "Cuzz", role: "JUNGLE" },
            { name: "Bdd", role: "MID" },
            { name: "Aiming", role: "ADC" },
            { name: "Ghost", role: "SUPPORT" },
            { name: "Pollu", role: "SUPPORT" },
            { name: "Score", role: "COACH" }
        ]
    },
    {
        name: "DRX",
        shortName: "DRX",
        region: "LCK",
        players: [
            { name: "Rich", role: "TOP" },
            { name: "Vincenzo", role: "JUNGLE" },
            { name: "ucal", role: "MID" },
            { name: "Jiwoo", role: "ADC" },
            { name: "Andil", role: "SUPPORT" },
            { name: "Joker", role: "COACH" }
        ]
    },
    {
        name: "BNK FEARX",
        shortName: "FOX",
        region: "LCK",
        players: [
            { name: "Clear", role: "TOP" },
            { name: "Raptor", role: "JUNGLE" },
            { name: "VicLa", role: "MID" },
            { name: "Daystar", role: "MID" },
            { name: "Diable", role: "ADC" },
            { name: "Kellin", role: "SUPPORT" },
            { name: "Edo", role: "COACH" }
        ]
    },
    {
        name: "Nongshim RedForce",
        shortName: "NS",
        region: "LCK",
        players: [
            { name: "Kingen", role: "TOP" },
            { name: "Sponge", role: "JUNGLE" },
            { name: "Scout", role: "MID" },
            { name: "Calix", role: "MID" },
            { name: "Taeyoon", role: "ADC" },
            { name: "Lehends", role: "SUPPORT" },
            { name: "DanDy", role: "COACH" }
        ]
    },
    {
        name: "OKSavingsBank BRION",
        shortName: "BRO",
        region: "LCK",
        players: [
            { name: "Casting", role: "TOP" },
            { name: "GIDEON", role: "JUNGLE" },
            { name: "Fisher", role: "MID" },
            { name: "Roamer", role: "MID" },
            { name: "Teddy", role: "ADC" },
            { name: "Namgung", role: "SUPPORT" },
            { name: "SSONG", role: "COACH" }
        ]
    },
    {
        name: "DN Freecs",
        // Note: Previous check showed "DN SOOPers (DNS)", but generic official name might be Freecs or KDF rebranded? 
        // Search says "DN Freecs". My DB check showed "DN SOOPers". I will Upsert to "DN Freecs" and set Alias/ShortName DNS.
        // Wait, if "DN SOOPers" exists, I should update it or use it. Let's start clean or update.
        // I will use "DN Freecs" as name and "DNS" as shortName.
        shortName: "DNS",
        region: "LCK",
        players: [
            { name: "DuDu", role: "TOP" },
            { name: "Pyosik", role: "JUNGLE" },
            { name: "Clozer", role: "MID" },
            { name: "deokdam", role: "ADC" },
            { name: "Peter", role: "SUPPORT" }
        ]
    }
];

async function seed() {
    console.log("Seeding LCK 2026 Data...");

    for (const t of teamsData) {
        // Upsert Team
        // Use shortName or Name to find? Name is unique in schema.
        // But what if "DN SOOPers" exists and I want to rename to "DN Freecs"?
        // I'll search by shortName first if available to update? No, schema says Name is @unique.
        // Strategy: Try to find by shortName first to handle rebrands, if not, find by Name.

        let team = await prisma.team.findFirst({ where: { shortName: t.shortName } });
        if (!team) {
            team = await prisma.team.findUnique({ where: { name: t.name } });
        }

        if (team) {
            console.log(`Updating team: ${t.name}`);
            team = await prisma.team.update({
                where: { id: team.id },
                data: {
                    name: t.name,
                    shortName: t.shortName,
                    region: t.region
                    // logo: keep existing
                }
            });
        } else {
            console.log(`Creating team: ${t.name}`);
            team = await prisma.team.create({
                data: {
                    name: t.name,
                    shortName: t.shortName,
                    region: t.region,
                    logo: '', // Placeholder
                }
            });
        }

        // Add Players
        for (const p of t.players) {
            // Check if player exists in team for this split
            const existingPlayer = await prisma.player.findFirst({
                where: {
                    teamId: team.id,
                    name: p.name,
                    split: "Split 1"
                }
            });

            if (!existingPlayer) {
                await prisma.player.create({
                    data: {
                        name: p.name,
                        role: p.role,
                        teamId: team.id,
                        split: "Split 1"
                    }
                });
            } else {
                // Update role if needed?
                if (existingPlayer.role !== p.role) {
                    await prisma.player.update({
                        where: { id: existingPlayer.id },
                        data: { role: p.role }
                    });
                }
            }
        }
    }
    console.log("Seeding complete!");
}

seed()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
