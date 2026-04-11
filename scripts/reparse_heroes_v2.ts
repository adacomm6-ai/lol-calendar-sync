import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// Local Gemini Setup
const API_KEY = process.env.GEMINI_API_KEY || "";
const genai = new GoogleGenerativeAI(API_KEY);
const model = genai.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
const prisma = new PrismaClient();

async function analyzeHeroLineup(imageBuffer: Buffer) {
    const prompt = `
    Analyze this League of Legends post-match scoreboard image.
    Strictly extract the list of 10 Champions (Heroes) played.
    Identify them visually from the champion avatars.
    
    The layout is standard:
    - Left Column / Top Section: Blue Team (Top, Jungle, Mid, ADC, Support)
    - Right Column / Bottom Section: Red Team (Top, Jungle, Mid, ADC, Support)

    Return ONLY a JSON object:
    {
      "blue": [
        {"role": "TOP", "hero": "Name"},
        {"role": "JUNGLE", "hero": "Name"},
        {"role": "MID", "hero": "Name"},
        {"role": "ADC", "hero": "Name"},
        {"role": "SUPPORT", "hero": "Name"}
      ],
      "red": [
         {"role": "TOP", "hero": "Name"},
         ...
      ]
    }
    
    Use standard English names (e.g. Lee Sin, Kai'Sa, Wukong).
    If a champion is unrecognizable, use "Unknown".
    `;

    const result = await model.generateContent([
        prompt,
        {
            inlineData: {
                mimeType: "image/png",
                data: imageBuffer.toString("base64")
            }
        }
    ]);

    const text = result.response.text();
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
}

async function main() {
    // Target the specific problematic matches first + others
    const targets = [
        // IDs found earlier
        '4ae728bc-afb0-4251-ba02-5d5fc9412bd9', // JDG-EDG G4
        '8aeeb730-9c86-4d8f-9cc3-7f78be8872c3', // AL-LGD G3
        'f3a3b060-9c4a-426c-95f0-ff529940a965', // IG-LNG G3
        '27649dc7-520f-492e-bf5a-f02d877474e8', // IG-LNG G2
        '4d652658-da53-4a75-9132-f9706cb22e30', // LGD-JDG G3
        // Add others ? Let's just do all with screenshots to be safe and consistent
    ];

    const games = await prisma.game.findMany({
        where: { screenshot: { not: null } },
        include: { match: { select: { teamA: true, teamB: true } } }
    });

    console.log(`Found ${games.length} games. Reprocessing...`);

    for (const game of games) {
        if (!game.screenshot) continue;

        // Filter if we want to target specific games
        // if (!targets.includes(game.id)) continue; 

        let relativePath = game.screenshot;
        if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
        const fullPath = path.join(process.cwd(), 'public', relativePath);

        if (!fs.existsSync(fullPath)) continue;

        console.log(`Processing Game ${game.id}...`);

        try {
            const buffer = fs.readFileSync(fullPath);
            const result = await analyzeHeroLineup(buffer);

            if (result && result.blue && result.red) {
                let currentData: any = {};
                try {
                    currentData = game.analysisData ? JSON.parse(game.analysisData) : {};
                } catch (e) { }

                let currentPlayers = currentData.damage_data || [];

                // Construct a Map of Role+Team -> Hero
                // Assumption: DB players have correct 'role' and 'team' fields.
                // If DB roles are 'Unknown', this falls back to index?
                // Let's rely on Team first.

                // Identify which DB players are Blue vs Red.
                // Usually matching match.teamA.name

                const teamAName = game.match?.teamA?.name; // Blue equivalent? 
                // Wait, DB doesn't strictly say TeamA is Blue.
                // But usually standard order.

                // Let's try to map by Index block first (0-4 Blue, 5-9 Red) AND Role.
                // If Role exists in DB player, use it.

                let changes = 0;

                currentPlayers.forEach((p: any, index: number) => {
                    // Determine Side
                    const isBlue = index < 5; // Assumption: First 5 are one team
                    const sideData = isBlue ? result.blue : result.red;

                    // Determine Role
                    // If p.role is valid, lookup in sideData. 
                    // If p.role 'Unknown', use index-based role (0=TOP, 1=JG...)
                    const roleOrder = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
                    let targetRole = p.role;
                    if (!targetRole || targetRole === 'Unknown') {
                        targetRole = roleOrder[index % 5];
                        // Update player role locally to persist it? Sure.
                        p.role = targetRole;
                    }

                    const heroEntry = sideData.find((h: any) => h.role === targetRole);

                    if (heroEntry && heroEntry.hero && heroEntry.hero !== 'Unknown') {
                        if (p.hero !== heroEntry.hero) {
                            // console.log(`  Update P${index}: ${p.hero} -> ${heroEntry.hero} (${targetRole})`);
                            p.hero = heroEntry.hero;
                            changes++;
                        }
                    }
                });

                if (changes > 0) {
                    currentData.damage_data = currentPlayers;
                    await prisma.game.update({
                        where: { id: game.id },
                        data: { analysisData: JSON.stringify(currentData) }
                    });
                    console.log(`  -> Updated ${changes} heroes.`);
                } else {
                    console.log(`  -> No changes.`);
                }
            }
        } catch (e) {
            console.error(`  -> Error:`, e);
        }

        // Small delay to avoid rate limit
        await new Promise(r => setTimeout(r, 2000));
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
