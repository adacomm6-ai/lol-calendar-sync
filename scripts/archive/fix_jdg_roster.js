const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const targets = ['JUNJIA', 'GALA', 'VAMPIRE', 'XIAOXU'];

    // Get JDG Team ID
    const jdg = await prisma.team.findFirst({
        where: { shortName: 'JDG' }
    });
    if (!jdg) throw new Error('JDG not found');

    console.log(`Fixing JDG roster for Split 1 (TeamId: ${jdg.id})...`);

    for (const name of targets) {
        // Find Demacia record to get Role (Strict match since Audit showed uppercase)
        const demacia = await prisma.player.findFirst({
            where: {
                teamId: jdg.id,
                name: name,
                split: '2026 Season Cup'
            }
        });

        if (!demacia) {
            console.log(`Warning: Could not find Demacia record for ${name}`);
            continue;
        }

        // Check if Split 1 exists
        const exists = await prisma.player.findFirst({
            where: {
                teamId: jdg.id,
                name: name,
                split: 'Split 1'
            }
        });

        if (exists) {
            console.log(`${name} already exists.`);
        } else {
            const newItem = await prisma.player.create({
                data: {
                    name: demacia.name,
                    role: demacia.role,
                    teamId: jdg.id,
                    split: 'Split 1'
                }
            });
            console.log(`Created ${name} for Split 1.`);
        }
    }
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
