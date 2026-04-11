// This script needs to be run in a way that respects Next.js aliases or just plain Node if paths are handled.
// Using a simpler approach: just perform the fetch and update directly in the script for verification.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ENDPOINT = "https://lol.fandom.com/api.php";

async function fetchTeamRoster(teamName) {
    const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "Players=P",
        fields: "P.ID=ID, P.Role=Role, P.Image=Image",
        where: `P.Team='${teamName.replace(/'/g, "\\'")}' AND P.IsPlayer=1`,
        limit: "20"
    });
    const url = `${ENDPOINT}?${params.toString()}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    if (!data.cargoquery) return [];
    return data.cargoquery.map(item => ({
        id: item.title.ID,
        role: item.title.Role,
        image: item.title.Image
    }));
}

async function syncTeam(teamId) {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return console.log(`Team ${teamId} not found`);

    console.log(`\n--- Syncing ${team.name} ---`);
    let roster = await fetchTeamRoster(team.name);
    if (roster.length === 0 && !team.name.endsWith('.CN')) {
        console.log(`Trying ${team.name}.CN...`);
        roster = await fetchTeamRoster(`${team.name}.CN`);
    }

    console.log(`Found ${roster.length} players.`);
    for (const p of roster) {
        const normalizedRole = (p.role || 'UNKNOWN').toUpperCase();
        console.log(`  Player: ${p.id.padEnd(15)} | Role: ${p.role} -> ${normalizedRole}`);

        await prisma.player.upsert({
            where: { name_teamId: { name: p.id, teamId: team.id } },
            update: { role: normalizedRole },
            create: {
                name: p.id,
                role: normalizedRole,
                teamId: team.id,
                split: 'Split 1'
            }
        });
    }
}

async function main() {
    await syncTeam('0d900a1a-c0fc-4965-83c6-cc9844700ca1'); // NIP
    await syncTeam('LOUD');
}

main().finally(() => prisma.$disconnect());
