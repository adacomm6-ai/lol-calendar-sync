const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Locating team DNS...");
    const team = await prisma.team.findFirst({
        where: { shortName: "DNS" }
    });

    if (!team) {
        console.error("Team DNS not found!");
        return;
    }

    console.log(`Found team: ${team.name} (${team.id})`);

    const split = "Split 1";
    const playerName = "Life";

    const existing = await prisma.player.findFirst({
        where: {
            teamId: team.id,
            name: playerName,
            split: split
        }
    });

    if (existing) {
        console.log(`Player ${playerName} already exists in ${split}.`);
    } else {
        console.log(`Adding ${playerName} to ${split}...`);
        await prisma.player.create({
            data: {
                name: playerName,
                role: "SUPPORT",
                split: split,
                teamId: team.id
            }
        });
        console.log("Player added successfully.");
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
