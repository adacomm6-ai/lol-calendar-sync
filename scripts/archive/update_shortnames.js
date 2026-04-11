
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const shortNames = {
    // LPL
    "Invictus Gaming": "IG",
    "LNG Esports": "LNG",
    "Top Esports": "TES",
    "FunPlus Phoenix": "FPX",
    "JD Gaming": "JDG",
    "Bilibili Gaming": "BLG",
    "Royal Never Give Up": "RNG",
    "Edward Gaming": "EDG",
    "Team WE": "WE",
    "LGD Gaming": "LGD",
    "Oh My God": "OMG",
    "ThunderTalk Gaming": "TT",
    "Ultra Prime": "UP",
    "Anyone's Legend": "AL",
    "Rare Atom": "RA",
    "Weibo Gaming": "WBG",
    "Ninjas in Pyjamas": "NIP",
    // LCK
    "T1": "T1",
    "Gen.G": "GEN",
    "Hanwha Life Esports": "HLE",
    "Dplus KIA": "DK",
    "KT Rolster": "KT",
    "Kwangdong Freecs": "KDF",
    "FearX": "FOX",
    "Nongshim RedForce": "NS",
    "DRX": "DRX",
    "OKSavingsBank BRION": "BRO"
};

async function main() {
    console.log("Updating Team Short Names...");
    for (const [name, shortName] of Object.entries(shortNames)) {
        try {
            const team = await prisma.team.findFirst({
                where: { name: name }
            });

            if (team) {
                await prisma.team.update({
                    where: { id: team.id },
                    data: { shortName: shortName }
                });
                console.log(`Updated ${name} -> ${shortName}`);
            } else {
                console.log(`Team not found: ${name}`);
            }
        } catch (e) {
            console.error(`Error updating ${name}:`, e.message);
        }
    }
    console.log("Done.");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
