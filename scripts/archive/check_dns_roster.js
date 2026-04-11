const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Searching for teams...");
    // Search for DNS, KDF, or SOOP
    const teams = await prisma.team.findMany({
        where: {
            OR: [
                { shortName: "DNS" },
                { shortName: "KDF" },
                { name: { contains: "SOOP" } },
                { name: { contains: "Freecs" } }
            ]
        },
        include: {
            players: true
        }
    });

    console.log("Found teams:", JSON.stringify(teams, null, 2));

    console.log("\nSearching for player 'Life'...");
    const life = await prisma.player.findMany({
        where: {
            name: "Life"
        },
        include: {
            team: true
        }
    });
    console.log("Found 'Life':", JSON.stringify(life, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
