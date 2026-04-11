
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

// Configuration
const API_KEY = process.env.GEMINI_API_KEY || "";
const genai = new GoogleGenerativeAI(API_KEY);

const model = genai.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    generationConfig: {
        responseMimeType: "application/json"
    }
});

const HISTORY_PROMPT = `
Analyze this "Player Match History" list from a League of Legends data site.
Extract the data row by row. Return a JSON array of game records.

For each row, extract:
1. **Date**: The date of the match (e.g. "2026-01-03").
2. **Opponent**: The name or short code of the opposing team (e.g. "JDG", "LNG", "TES"). Look at the logos or text.
3. **Game Label**: The Game Number (e.g. "GAME 1", "GAME 2", "GAME 3"). If it says "BO3" or similar, try to infer, but usually it says "GAME X".
4. **Result**: "WIN" or "LOSS". Look for badges like "胜" (Victory/Win) which is usually Blue/Green, or "负" (Defeat/Loss) which is Red/Gray.
5. **Hero**: The Champion name. Identify from the icon.
6. **KDA**: The Kills/Deaths/Assists string (e.g. "2/4/9").
7. **Damage**: OPTIONAL. If there is a column for Damage (numbers like "14.5k"), extract it. If not present, return null.

Return JSON format:
{
  "matches": [
    {
       "date": "YYYY-MM-DD",
       "opponent": "JDG",
       "game_number": 1,
       "result": "WIN",
       "hero": "JarvanIV",
       "kda": "2/4/9",
       "damage": null
    }
  ]
}
`;

async function main() {
    try {
        const imagePath = 'd:/lol-data-system/pictures/WEI德玛西亚杯.png';
        const imageBuffer = fs.readFileSync(imagePath);

        console.log(`Analyzing ${imagePath}...`);

        const result = await model.generateContent([
            HISTORY_PROMPT,
            {
                inlineData: {
                    mimeType: "image/png",
                    data: imageBuffer.toString("base64")
                }
            }
        ]);

        const responseText = result.response.text();
        console.log("--- Raw Response ---");
        console.log(responseText);
        console.log("--------------------");

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error("No JSON found in response");
        } else {
            const data = JSON.parse(jsonMatch[0]);
            console.log("Parsed JSON:", JSON.stringify(data, null, 2));
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

main();
