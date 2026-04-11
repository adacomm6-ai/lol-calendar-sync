
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

async function main() {
    // Correct IDs fetched from previous step
    const AL_ID = '020ad6e7-54e8-495a-9e44-5df83e6c4b8d';
    const IG_ID = '9a2fb4e6-a267-4563-9b81-5ecd507e4d6a';

    // Target Time: 2026-01-27 19:00:00 CST (Beijing)
    // UTC Time: 2026-01-27 11:00:00 UTC
    const startTime = new Date('2026-01-27T11:00:00Z');

    console.log(`Inserting match AL vs IG at ${startTime.toISOString()}...`);

    try {
        const match = await prisma.match.create({
            data: {
                id: crypto.randomUUID(),
                startTime: startTime,
                status: 'SCHEDULED', // Unplayed
                format: 'BO3',
                stage: 'Split 1',
                tournament: '2026 LPL Split 1', // Guessed based on context
                teamAId: AL_ID,
                teamBId: IG_ID,
                // Create a dummy game or empty game? Usually specific game data is synced later.
                // Just create the match shell.
            }
        });

        console.log('Match inserted successfully:', match);
    } catch (e) {
        console.error('Error inserting match:', e);
    }
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
