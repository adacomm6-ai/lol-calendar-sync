
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addPlayers() {
    // 1. Find TT Team
    const team = await prisma.team.findFirst({
        where: {
            OR: [{ name: 'TT' }, { shortName: 'TT' }]
        }
    });
    if (!team) throw new Error("TT not found");

    console.log(`Adding players to ${team.name} (${team.id})...`);

    // 2. Define Players
    const newPlayers = [
        { name: 'Keshi', role: 'TOP', split: '2026 LPL第一赛段' },
        { name: 'Heru', role: 'MID', split: '2026 LPL第一赛段' }
    ];

    for (const p of newPlayers) {
        // Check if exists anywhere first
        const exists = await prisma.player.findFirst({
            where: { name: { equals: p.name, mode: 'insensitive' } }
        });

        if (exists) {
            console.log(`Player ${p.name} already exists (TeamID: ${exists.teamId}). Updating to TT...`);
            await prisma.player.update({
                where: { id: exists.id },
                data: {
                    teamId: team.id,
                    split: p.split,
                    role: p.role // Update role just in case
                }
            });
        } else {
            console.log(`Creating new player ${p.name}...`);
            await prisma.player.create({
                data: {
                    name: p.name,
                    role: p.role,
                    teamId: team.id,
                    split: p.split,
                    photo: '' // Fixed field name
                }
            });
        }
    }
}

addPlayers()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
