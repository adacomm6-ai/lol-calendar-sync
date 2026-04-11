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

    Return ONLY a JSON object in this format:
    {
      "heroes": ["Hero1", "Hero2", "Hero3", "Hero4", "Hero5", "Hero6", "Hero7", "Hero8", "Hero9", "Hero10"]
    }
    
    Order:
    The first 5 should be the Blue/Left Team (Top -> Support).
    The next 5 should be the Red/Right Team (Top -> Support).
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
    // Clean code blocks
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
}

async function main() {
    const games = await prisma.game.findMany({
        where: { screenshot: { not: null } },
        include: { match: { select: { teamA: true, teamB: true } } }
    });

    console.log(`Found ${games.length} games with screenshots.`);

    for (const game of games) {
        if (!game.screenshot) continue;

        let relativePath = game.screenshot;
        if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);

        const fullPath = path.join(process.cwd(), 'public', relativePath);

        if (!fs.existsSync(fullPath)) {
            console.log(`  -> File not found: ${fullPath} (Game ${game.id})`);
            continue;
        }

        console.log(`Reprocessing Heroes for Game ${game.id} (G${game.gameNumber})...`);

        try {
            const buffer = fs.readFileSync(fullPath);
            const result = await analyzeHeroLineup(buffer);

            if (result && result.heroes && Array.isArray(result.heroes) && result.heroes.length === 10) {
                let currentData: any = {};
                try {
                    currentData = game.analysisData ? JSON.parse(game.analysisData) : {};
                } catch (e) { }

                let currentPlayers = currentData.damage_data || [];

                if (currentPlayers.length === 10) {
                    let changes = 0;
                    for (let i = 0; i < 10; i++) {
                        const newHero = result.heroes[i];
                        const oldHero = currentPlayers[i].hero; // Use indexing
                        // Note: analysisData usually has flat list.

                        if (newHero && newHero !== 'Unknown' && newHero !== oldHero) {
                            // Only update if new prediction looks valid
                            currentPlayers[i].hero = newHero;
                            changes++;
                        }
                    }

                    if (changes > 0) {
                        currentData.damage_data = currentPlayers;
                        await prisma.game.update({
                            where: { id: game.id },
                            data: { analysisData: JSON.stringify(currentData) }
                        });
                        console.log(`    -> Updated ${changes} heroes.`);
                    } else {
                        console.log(`    -> No new hero data or identical.`);
                    }
                } else {
                    console.log(`    -> Current player count ${currentPlayers.length} != 10. Skipping.`);
                }
            } else {
                console.log(`    -> Failed to extract 10 heroes.`);
            }
        } catch (e) {
            console.error(`    -> Error:`, e);
        }
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
