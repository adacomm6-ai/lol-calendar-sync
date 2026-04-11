
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const teamIds = [
        '9cb94484-f890-42b7-889b-6a2975b654cb', // Likely TES
        '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a'  // Likely IG
    ];

    for (const teamId of teamIds) {
        const team = await prisma.team.findUnique({
            where: { id: teamId },
            include: { players: true }
        });

        if (!team) {
            console.log(`Team ${teamId} not found`);
            continue;
        }

        console.log(`\n=== Team: ${team.name} (${team.shortName}) ===`);
        console.log(`Total Players: ${team.players.length}`);

        // Sort by role then name for easier visual diff
        const sortedPlayers = team.players.sort((a, b) => {
            if (a.role !== b.role) return a.role.localeCompare(b.role);
            return a.name.localeCompare(b.name);
        });

        sortedPlayers.forEach(p => {
            console.log(`[${p.role}] ${p.name} (Split: ${p.split}) - ID: ${p.id} - Updated: ${p.updatedAt.toISOString().split('T')[0]}`);
        });
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
