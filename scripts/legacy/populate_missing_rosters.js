const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const rosters = {
        "LNG": [
            { name: "sheer", role: "TOP" },
            { name: "Croco", role: "JUNGLE" },
            { name: "BuLLDoG", role: "MID" },
            { name: "1xn", role: "ADC" },
            { name: "MISSING", role: "SUPPORT" }
        ],
        "UP": [
            { name: "Liangchen", role: "TOP" },
            { name: "Grizzly", role: "JUNGLE" },
            { name: "Saber", role: "MID" },
            { name: "Hena", role: "ADC" },
            { name: "Xiaoxia", role: "SUPPORT" }
        ],
        "OMG": [
            { name: "Hery", role: "TOP" },
            { name: "re0", role: "JUNGLE" },
            { name: "haichao", role: "MID" },
            { name: "Starry", role: "ADC" },
            { name: "Moham", role: "SUPPORT" }
        ]
    };

    const split = "Split 1";

    for (const [shortName, players] of Object.entries(rosters)) {
        console.log(`Processing ${shortName}...`);
        const team = await prisma.team.findFirst({
            where: { shortName: shortName }
        });

        if (!team) {
            console.error(`Team ${shortName} not found!`);
            continue;
        }

        for (const p of players) {
            const existing = await prisma.player.findFirst({
                where: {
                    teamId: team.id,
                    name: p.name,
                    split: split
                }
            });

            if (!existing) {
                console.log(`Adding ${p.name} (${p.role}) to ${shortName}...`);
                await prisma.player.create({
                    data: {
                        name: p.name,
                        role: p.role,
                        split: split,
                        teamId: team.id
                    }
                });
            } else {
                console.log(`Skipping ${p.name} (exists)`);
            }
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
