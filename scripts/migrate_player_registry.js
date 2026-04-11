const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Starting data migration to PlayerRegistry...");

    // 1. Fetch all existing players
    const allPlayers = await prisma.player.findMany();
    console.log(`Found ${allPlayers.length} existing player records.`);

    // 2. Group by case-insensitive name
    const groupedPlayers = {};
    for (const p of allPlayers) {
        const key = p.name.trim().toLowerCase();
        if (!groupedPlayers[key]) {
            groupedPlayers[key] = [];
        }
        groupedPlayers[key].push(p);
    }

    let createdRegistries = 0;
    let deletedDuplicates = 0;

    // 3. Process each group
    for (const [key, group] of Object.entries(groupedPlayers)) {
        // Elect the primary player record (e.g., the first one created, or just the first in array)
        // We'll keep group[0] as the primary and delete the rest
        const primaryPlayer = group[0];

        // 4. Create registries for ALL records in the group, linked to the primary player
        for (const p of group) {
            // A player might have multiple splits stored as comma separated strings in `p.split`
            const splitRaw = p.split || "Split 1";
            const splits = splitRaw.split(',').map(s => s.trim()).filter(s => s.length > 0);

            for (const split of splits) {
                // Check if registry already exists to avoid duplicates during dev retries
                const existingRegistry = await prisma.playerRegistry.findFirst({
                    where: {
                        playerId: primaryPlayer.id,
                        teamId: p.teamId,
                        split: split
                    }
                });

                if (!existingRegistry) {
                    await prisma.playerRegistry.create({
                        data: {
                            playerId: primaryPlayer.id,
                            teamId: p.teamId,
                            role: p.role,
                            split: split,
                            isCurrent: true // We can assume all migrated ones were considered 'current' at their time
                        }
                    });
                    createdRegistries++;
                }
            }
        }

        // 5. Delete secondary player records
        for (let i = 1; i < group.length; i++) {
            const secPlayer = group[i];
            await prisma.player.delete({
                where: { id: secPlayer.id }
            });
            deletedDuplicates++;
        }

        // 6. Update Primary Player name to be nicely formatted (use the one from primary)
        // This is to prepare for the `@unique` constraint on `name` field we will add next.
        await prisma.player.update({
            where: { id: primaryPlayer.id },
            data: { name: primaryPlayer.name.trim() } // ensure trimmed
        });
    }

    console.log(`Migration completed successfully!`);
    console.log(`- Created ${createdRegistries} PlayerRegistry entries.`);
    console.log(`- Merged and deleted ${deletedDuplicates} duplicate Player records.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
