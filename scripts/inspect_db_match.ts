
import { prisma } from '../src/lib/db';

async function run() {
    const matchId = '9ed93e84-e0d7-4880-8c94-d2b18f2750af';
    // Clean string just in case
    const id = matchId.trim();

    console.log(`Inspecting Match ${id}...`);

    const match = await prisma.match.findUnique({
        where: { id },
        include: {
            teamA: true,
            teamB: true
        }
    });

    if (!match) {
        console.error("Match not found in DB!");
        return;
    }

    console.log("Match Found:");
    console.log(`Tournament: ${match.tournament}`);
    console.log(`Start Time: ${match.startTime}`);

    console.log("--- Team A ---");
    console.log(match.teamA);

    console.log("--- Team B ---");
    console.log(match.teamB);

    // Simulate Normalization
    const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (match.teamA) {
        const n = normalizeName(match.teamA.name);
        const s = normalizeName(match.teamA.shortName || '');
        console.log(`Normalized A: name="${n}", short="${s}"`);
    }

    if (match.teamB) {
        const n = normalizeName(match.teamB.name);
        const s = normalizeName(match.teamB.shortName || '');
        console.log(`Normalized B: name="${n}", short="${s}"`);
    }
}

run();
