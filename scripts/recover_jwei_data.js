const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

// Hardcoded API Key from src/lib/gemini.ts (or env if available)
const API_KEY = process.env.GEMINI_API_KEY || "";
const genai = new GoogleGenerativeAI(API_KEY);

const MATCH_HISTORY_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        matches: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    date: { type: SchemaType.STRING },
                    opponent: { type: SchemaType.STRING },
                    game_number: { type: SchemaType.INTEGER },
                    result: { type: SchemaType.STRING, enum: ["WIN", "LOSS"] },
                    hero: { type: SchemaType.STRING },
                    kda: { type: SchemaType.STRING },
                    damage: { type: SchemaType.STRING, nullable: true }
                },
                required: ["date", "opponent", "result", "hero", "kda"]
            }
        }
    },
    required: ["matches"]
};

const historyModel = genai.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    generationConfig: {
        responseMimeType: "application/json",
        responseSchema: MATCH_HISTORY_SCHEMA
    }
});

const HISTORY_PROMPT = `
Analyze this "Player Match History" list from a League of Legends data site.
Extract the data row by row. Return a JSON array of game records.

For each row, extract:
1. **Date**: The date of the match.
2. **Opponent**: The name or short code of the opposing team.
3. **Game Label**: The Game Number (e.g. 1, 2, 3).
4. **Result**: "WIN" or "LOSS".
5. **Hero**: The Champion name.
6. **KDA**: The Kills/Deaths/Assists string.
7. **Damage**: Damage number if available.

Return JSON format:
{
  "matches": [
    { ... }
  ]
}
`;

function cleanJson(text) {
    let cleaned = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
    const firstBrace = cleaned.search(/[\{\[]/);
    const lastBrace = cleaned.search(/[\]\}][^\]\}]*$/);
    if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    return cleaned;
}

async function analyzeMatchHistoryImage(imageBuffer) {
    try {
        const result = await historyModel.generateContent([
            HISTORY_PROMPT,
            {
                inlineData: {
                    mimeType: "image/png",
                    data: imageBuffer.toString("base64")
                }
            }
        ]);
        const responseText = result.response.text();
        console.log("Raw Response:", responseText);
        const cleaned = cleanJson(responseText);
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Gemini Error:", e);
        return null;
    }
}

const imagePath = 'C:/Users/WINDOWS/.gemini/antigravity/brain/dde910b4-51b2-465a-8bc8-7f689f108f95/uploaded_image_1768406398559.png';

async function main() {
    if (!fs.existsSync(imagePath)) {
        console.error(`File not found: ${imagePath}`);
        return;
    }
    const buffer = fs.readFileSync(imagePath);
    console.log("Analyzing image...");
    const data = await analyzeMatchHistoryImage(buffer);
    if (data) {
        console.log("\n--- Parsed Data ---");
        console.log(JSON.stringify(data, null, 2));
    }
}

main();
