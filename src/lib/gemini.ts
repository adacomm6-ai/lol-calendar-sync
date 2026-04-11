import { GoogleGenerativeAI, SchemaType, Schema } from "@google/generative-ai";
import sharp from "sharp";
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";

// NOTE: API Key 从 .env 的 GEMINI_API_KEY 读取，禁止在此硬编码
const API_KEY = process.env.GEMINI_API_KEY || "";

function checkApiKey() {
    if (!API_KEY) {
        throw new Error("GEMINI_API_KEY is missing in production environment. Please add it to Vercel Environment Variables and REDEPLOY the project.");
    }
}

const genai = new GoogleGenerativeAI(API_KEY || "dummy_key_to_avoid_init_error");

// Response Data Types
export interface GeminiMatchData {
    winner: "Blue" | "Red" | "Unknown";
    duration: string;
    total_kills?: number;
    blue_kills?: number;
    red_kills?: number;
    blue_team_name?: string;
    red_team_name?: string;
    gold_chart_bbox?: [number, number, number, number];
    gold_curve_path?: string;
    match?: string;
    raw_text?: string;
    damage_data: Array<{
        name: string;
        damage: number;
        kills: number;
        deaths: number;
        assists: number;
        team: "Blue" | "Red";
        role: "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT" | "Unknown";
        hero: string;
    }>;
}

export interface GeminiHistoryMatch {
    date: string;
    opponent: string;
    game_number: number;
    result: "WIN" | "LOSS";
    hero: string;
    kda: string;
    damage: string | null;
}

export interface GeminiHistoryData {
    matches: GeminiHistoryMatch[];
}

const model = genai.getGenerativeModel({
    model: "gemini-flash-latest",
    generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
                winner: { type: SchemaType.STRING, enum: ["Blue", "Red", "Unknown"], format: "enum" },
                duration: { type: SchemaType.STRING },
                total_kills: { type: SchemaType.INTEGER },
                blue_kills: { type: SchemaType.INTEGER },
                red_kills: { type: SchemaType.INTEGER },
                blue_team_name: { type: SchemaType.STRING },
                red_team_name: { type: SchemaType.STRING },
                gold_chart_bbox: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.INTEGER },
                    description: "[ymin, xmin, ymax, xmax] coordinates (0-1000)"
                },
                damage_data: {
                    type: SchemaType.ARRAY,
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            name: { type: SchemaType.STRING },
                            damage: { type: SchemaType.INTEGER },
                            kills: { type: SchemaType.INTEGER },
                            deaths: { type: SchemaType.INTEGER },
                            assists: { type: SchemaType.INTEGER },
                            team: { type: SchemaType.STRING, enum: ["Blue", "Red"], format: "enum" },
                            role: { type: SchemaType.STRING, enum: ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT", "Unknown"], format: "enum" },
                            hero: { type: SchemaType.STRING }
                        },
                        required: ["name", "damage", "kills", "deaths", "assists", "team", "role", "hero"]
                    }
                }
            },
            required: ["winner", "duration", "damage_data"]
        } as Schema
    }
});

const PROMPT = `
Analyze this League of Legends post-match scoreboard. 
Extract the following data for both teams (Blue and Red):

1. **Winner** (Blue or Red) - Look at which team has "Victory" or "Defeat".
2. **Game Duration** (e.g. 30:00) - Usually at the top right corner.
3. **Total Kills** - Sum of kills for both teams, or look for the total kill score at the top (e.g. 12 - 5).
4. **Team Kills** (Blue/Red) - Specific kill counts for each team.

5. **Team Names** (CRITICAL):
   - Look at the TOP HEADER of the scoreboard.
   - There is usually a central Timer/Score.
   - The Name/Abbreviation on the **LEFT** of the timer is the **BLUE TEAM**.
   - The Name/Abbreviation on the **RIGHT** of the timer is the **RED TEAM**.
   - Examples: "LNG", "IG", "BLG", "T1".

6. **Detailed Player Stats** (5 Blue, 5 Red):
   - **Name**: The player's Summoner Name.
   - **Champion (Hero)**: IDENTIFY the champion from the icon next to the name and return Riot Data Dragon champion ID format (ASCII, no spaces/punctuation). **Do NOT return "Unknown".** If text is truncated (e.g. "Ren"), infer full champion ("Renekton"). Use these canonical examples: Xin Zhao -> XinZhao, Kog'Maw -> KogMaw, Kai'Sa -> Kaisa, K'Sante -> KSante, Cho'Gath -> Chogath, Kha'Zix -> Khazix, Vel'Koz -> Velkoz, Wukong -> MonkeyKing, Nunu & Willump -> Nunu.
   - **K/D/A**: Extract the INDIVIDUAL Kills, Deaths, and Assists for THIS PLAYER. Do NOT use team totals. Look for the numbers in the K/D/A column for this specific row.
   - **Damage Dealt**: The number in the damage graph/column.
   - **Role**: TOP, JUNGLE, MID, ADC, SUPPORT. Try to infer from champion/order.
   - **Team**: Blue (Left/Top) or Red (Right/Bottom).

7. **Gold Difference Graph Location**:
   - Identify the bounding box of the "Gold Difference" (or similar economy) graph area.
   - Format: [ymin, xmin, ymax, xmax] on a scale of 0 to 1000.
   - This is CRITICAL for cropping the image.

Important: Ensure strictly valid JSON.
`;

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

const MATCH_HISTORY_SCHEMA: Schema = {
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
                    result: { type: SchemaType.STRING, enum: ["WIN", "LOSS"], format: "enum" },
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
    model: "gemini-flash-latest",
    generationConfig: {
        responseMimeType: "application/json",
        responseSchema: MATCH_HISTORY_SCHEMA
    }
});

export async function analyzeMatchHistoryImage(imageBuffer: Buffer) {
    checkApiKey();
    try {
        // Retry logic for network instability
        const maxRetries = 3;
        let result;
        let lastError;

        for (let i = 0; i < maxRetries; i++) {
            try {
                result = await historyModel.generateContent([
                    HISTORY_PROMPT,
                    {
                        inlineData: {
                            mimeType: "image/png",
                            data: imageBuffer.toString("base64")
                        }
                    }
                ]);
                break; // Success
            } catch (e: unknown) {
                const error = e as Error;
                console.warn(`History Attempt ${i + 1} failed: ${error.message}`);
                lastError = error;
                if (i < maxRetries - 1) {
                    const delay = 1000 * Math.pow(2, i);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        if (!result && lastError) {
            throw lastError;
        }

        if (!result) throw new Error("Unknown error: Result is undefined after retries");

        const responseText = result.response.text();
        console.log("Raw Gemini Response:", responseText);

        const cleanedText = cleanJson(responseText);
        let data: GeminiHistoryData;

        try {
            data = JSON.parse(cleanedText) as GeminiHistoryData;
        } catch (parseError) {
            console.error("JSON Parse Failed:", parseError);
            throw new Error("Invalid JSON returned by AI");
        }

        // Handle Array Root
        if (Array.isArray(data)) {
            data = { matches: data as any };
        }

        // Validate
        if (!data.matches && !Array.isArray(data.matches)) {
            data.matches = []; // Default to empty to prevent undefined error, but let action check logic handle "empty" warning if needed
        }

        return { success: true, data, raw: responseText }; // Return raw text for debug

    } catch (e: unknown) {
        console.error("History Analysis Error:", e);
        const errorMsg = e instanceof Error ? e.message : String(e);
        return {
            success: false,
            error: `Analysis failed: ${errorMsg}`,
            data: { matches: [] }
        };
    }
}

function cleanJson(text: string): string {
    // Remove markdown code blocks
    let cleaned = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
    // Locate first '{' or '['
    const firstBrace = cleaned.search(/[\{\[]/);
    const lastBrace = cleaned.search(/[\]\}][^\]\}]*$/);

    if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    return cleaned;
}

export async function analyzeImage(imageBuffer: Buffer) {
    checkApiKey();
    try {
        // Retry logic for network instability
        const maxRetries = 3;
        let result;
        let lastError;

        for (let i = 0; i < maxRetries; i++) {
            try {
                result = await model.generateContent([
                    PROMPT,
                    {
                        inlineData: {
                            mimeType: "image/png",
                            data: imageBuffer.toString("base64")
                        }
                    }
                ]);
                break; // Success
            } catch (e: unknown) {
                const error = e as Error;
                console.warn(`Attempt ${i + 1} failed: ${error.message}`);
                lastError = error;
                if (i < maxRetries - 1) {
                    const delay = 1000 * Math.pow(2, i); // 1s, 2s, 4s...
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        if (!result && lastError) {
            throw lastError; // Throw final error if all retries failed
        }

        if (!result) throw new Error("Unknown error: Result is undefined after retries");

        const responseText = result.response.text();
        const data = JSON.parse(responseText) as GeminiMatchData;

        // Crop Gold Chart if BBox found
        if (data.gold_chart_bbox && data.gold_chart_bbox.length === 4) {
            try {
                const [ymin, xmin, ymax, xmax] = data.gold_chart_bbox;
                const metadata = await sharp(imageBuffer).metadata();

                if (metadata.width && metadata.height) {
                    // Convert 0-1000 scale to pixels
                    const left = Math.floor((xmin / 1000) * metadata.width);
                    const top = Math.floor((ymin / 1000) * metadata.height);
                    const width = Math.floor(((xmax - xmin) / 1000) * metadata.width);
                    const height = Math.floor(((ymax - ymin) / 1000) * metadata.height);

                    if (width > 0 && height > 0) {
                        const outputDir = path.join(process.cwd(), "public", "uploads", "gold_curves");
                        await fs.mkdir(outputDir, { recursive: true });

                        const filename = `gold_curve_${crypto.randomBytes(8).toString("hex")}.png`;
                        const outputPath = path.join(outputDir, filename);

                        await sharp(imageBuffer)
                            .extract({ left, top, width, height })
                            .toFile(outputPath);

                        data["gold_curve_path"] = `/uploads/gold_curves/${filename}`;
                    }
                }
            } catch (cropError) {
                console.error("Cropping Failed:", cropError);
            }
        }

        data["match"] = "Gemini Vision Parsed (Node.js)";
        data["raw_text"] = "Analyzed by Gemini 2.0 Flash (Stable) (Node.js)";

        return { success: true, data };

    } catch (e: unknown) {
        console.error("Analysis Error:", e);
        return {
            success: false,
            error: String(e),
            data: {
                winner: "Unknown" as const,
                duration: "00:00",
                damage_data: []
            } as any
        };
    }
}

const BETTING_STRATEGY_SCHEMA: Schema = {
    type: SchemaType.OBJECT,
    properties: {
        strategy_text: { type: SchemaType.STRING },
        confidence_level: { type: SchemaType.STRING, enum: ["HIGH", "MEDIUM", "LOW"], format: "enum" },
        risk_alert: { type: SchemaType.STRING, nullable: true }
    },
    required: ["strategy_text", "confidence_level"]
};

const bettingModel = genai.getGenerativeModel({
    model: "gemini-flash-latest",
    generationConfig: {
        responseMimeType: "application/json",
        responseSchema: BETTING_STRATEGY_SCHEMA
    }
});

export async function generateBettingStrategy(context: string) {
    checkApiKey();
    try {
        const prompt = `
        You are a conservative Esports Betting Analyst. Your goal is to protect the user's capital.
        Analyze the provided Match Data (Team A vs Team B), Recent Performance (Last 3 Games), and Current Odds.

        **Markets to Analyze:**
        1. Handicap / Kills Spread (让分)
        2. Game Duration Over/Under (时间大小)
        3. Total Kills Over/Under (总击杀大小)

        **Logic Flow:**
        1. **Check Stability**: Look at the variance in recent games (Duration, Kill counts).
           - IF UNSTABLE (High variance):
             - Output MUST start with: "📉 **不稳定风险 (UNSTABLE)**: 建议减少注额 (Reduce Stake)."
             - explicitly list which markets are too risky.
           - IF STABLE:
             - Analyze specific matchups (e.g. Avg Duration < Odds Threshold).
             - Identify "Traps" or markets to **AVOID** (e.g. "Don't buy Over 32min because Avg is 28min").

        **Output Format**:
        Return a JSON with 'strategy_text'.
        CRITICAL: The 'strategy_text' MUST be written in **Simplified Chinese (简体中文)**.
        
        **Logic Requirement**:
        1. **Combined Analysis (Comprehensive)**:
           - For **Duration** & **Total Kills**, you MUST evaluate data from **BOTH TEAMS**.
           - Do NOT just look at one team. Combine their styles (e.g., Team A (Avg 35m) + Team B (Avg 33m) => High Probability of OVER).
           - If one is Fast and one is Slow, explain the conflict.
        2. **Defensive Lean**: 
           - Even if data is unstable/conflicting, provide a **Defensive Lean (防守倾向)** based on the weighted aggregate.
           - Compare the **Combined Trend** vs **Odds Threshold**.

        **Structure Required:**
        1. **比赛时间 (Duration)**:
           - Verdict: [**Big (大)** / **Small (小)**]
           - Reason: "Combined Avg ~[X]m (A:[A]m, B:[B]m) vs Threshold [Y]m..."
        2. **总击杀 (Total Kills)**: 
           - Verdict: [**Big (大)** / **Small (小)**]
           - Reason: "Both teams trend High Kills (Avg [X], [Y]) > Threshold [Z]..."
        3. **让分/胜负 (Handicap/Winner)**:
           - Verdict: [Team Name]
           - Reason: "Winrate/Form..."

        **Context Data**:
        ${context}
        `;

        const result = await bettingModel.generateContent(prompt);
        const responseText = result.response.text();
        return JSON.parse(responseText);

    } catch (e: unknown) {
        console.error("Betting Strategy Error:", e);
        return { strategy_text: "AI 分析服务暂时不可用 (Analysis Unavailable)", confidence_level: "LOW" };
    }
}

// --- ODDS OCR ---

const ODDS_SCHEMA: Schema = {
    type: SchemaType.OBJECT,
    properties: {
        winner: {
            type: SchemaType.OBJECT,
            properties: {
                teamA: { type: SchemaType.NUMBER, description: "Decimal odds for Team A Win" },
                teamB: { type: SchemaType.NUMBER, description: "Decimal odds for Team B Win" }
            },
            nullable: true
        },
        handicap: {
            type: SchemaType.OBJECT,
            properties: {
                threshold: { type: SchemaType.NUMBER, description: "Spread value (e.g. -1.5)" },
                teamA: { type: SchemaType.NUMBER, description: "Odds for Team A to cover" },
                teamB: { type: SchemaType.NUMBER, description: "Odds for Team B to cover" }
            },
            nullable: true
        },
        total_kills: {
            type: SchemaType.OBJECT,
            properties: {
                threshold: { type: SchemaType.NUMBER, description: "Total Kills Line (e.g. 26.5)" },
                over: { type: SchemaType.NUMBER, description: "Odds for Over" },
                under: { type: SchemaType.NUMBER, description: "Odds for Under" }
            },
            nullable: true
        },
        duration: {
            type: SchemaType.OBJECT,
            properties: {
                threshold: { type: SchemaType.NUMBER, description: "Time Line in Minutes (e.g. 30.5)" },
                over: { type: SchemaType.NUMBER, description: "Odds for Over" },
                under: { type: SchemaType.NUMBER, description: "Odds for Under" }
            },
            nullable: true
        }
    }
};

const oddsModel = genai.getGenerativeModel({
    model: "gemini-flash-latest",
    generationConfig: {
        responseMimeType: "application/json",
        responseSchema: ODDS_SCHEMA
    }
});

export async function extractOddsFromImage(imageBuffer: Buffer) {
    checkApiKey();
    try {
        const prompt = `
        You are an expert Esports Odds Parser.
        Analyze this screenshot of a Betting Table.
        
        **VISUAL LAYOUT STRATEGY**:
        The table almost always follows this vertical order:
        
        **ROW 1: MATCH WINNER (Winner / Moneyline)**
        - Topmost row.
        - Two decimal numbers (e.g., 1.32 and 3.45).
        - Extract into 'winner'.

        **ROW 2: HANDICAP (Kills Spread / 让分)**
        - Second row.
        - Look for a number with a **+/- sign** (e.g., -8.5, +8.5, -1.5). This is the 'threshold'.
        - The odds are next to it.
        - Extract into 'handicap'.

        **ROW 3: TOTAL KILLS (Over/Under / 总击杀)**
        - Third row.
        - Look for a large integer/half-integer (e.g., 29.5, 26.5, 22.5). This is the 'threshold'.
        - Extract into 'total_kills'.

        **ROW 4: DURATION (Time / 时长)**
        - Fourth row (sometimes bottom).
        - Look for a time value (e.g., 30, 31, 32, 29).
        - Often labeled "大于 > 32" (Over 32) and "小于 < 32" (Under 32).
        - Extract into 'duration'.

        **FALLBACK HIERARCHY**:
        1. Try to find keys by Chinese/English text ("让分", "大小").
        2. If text is blurry, use the **ROW ORDER** above.
        3. If you see "29.5" it's definitely Kills. If you see "32" or "30" it's likely Duration.

        Return strictly JSON.
        `;

        const result = await oddsModel.generateContent([
            prompt,
            {
                inlineData: {
                    mimeType: "image/png",
                    data: imageBuffer.toString("base64")
                }
            }
        ]);

        const responseText = result.response.text();
        return JSON.parse(responseText);

    } catch (e: unknown) {
        const error = e as Error;
        console.error("Odds OCR Error:", error);
        return { error: error.message };
    }
}

export interface GeminiScheduleEntry {
    week?: string | null;
    date: string;
    time: string;
    team1: string;
    team2: string;
    format?: string | null;
}

export interface GeminiScheduleData {
    entries: GeminiScheduleEntry[];
}

const SCHEDULE_SCHEMA: Schema = {
    type: SchemaType.OBJECT,
    properties: {
        entries: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    week: { type: SchemaType.STRING, nullable: true },
                    date: { type: SchemaType.STRING },
                    time: { type: SchemaType.STRING },
                    team1: { type: SchemaType.STRING },
                    team2: { type: SchemaType.STRING },
                    format: { type: SchemaType.STRING, nullable: true },
                },
                required: ['date', 'time', 'team1', 'team2'],
            },
        },
    },
    required: ['entries'],
};

const scheduleModel = genai.getGenerativeModel({
    model: 'gemini-flash-latest',
    generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SCHEDULE_SCHEMA,
    },
});

export async function analyzeScheduleScreenshotImage(
    imageBuffer: Buffer,
    options?: { region?: string | null; teamHints?: string[] | null; formatHint?: string | null },
) {
    checkApiKey();
    try {
        const teamHints = (options?.teamHints || []).filter(Boolean).slice(0, 80).join(', ');
        const prompt = `
        你是一名电竞赛程识别助手。请读取这张英雄联盟赛程截图，并提取所有比赛。

        输出要求：
        1. 只输出比赛，不要输出按钮、[hide]、时区切换、标题装饰。
        2. week 字段保留原图里的 Week 1 / Week 2 这类标签；没有就返回 null。
        3. date 必须统一成 YYYY-MM-DD。
        4. time 必须统一成 HH:mm，24小时制。
        5. team1 / team2 只保留队名简称或队名文本，不要带 logo 描述。
        6. format 如果图里没有明确写，就返回 ${options?.formatHint ? `"${options.formatHint}"` : 'null'}。
        7. 一张图里每一场比赛都要单独返回一条 entries 项。

        当前赛区提示：${options?.region || '未知'}
        当前可参考队名：${teamHints || '无'}
        `;

        const result = await scheduleModel.generateContent([
            prompt,
            {
                inlineData: {
                    mimeType: 'image/png',
                    data: imageBuffer.toString('base64'),
                },
            },
        ]);

        const responseText = result.response.text();
        const data = JSON.parse(cleanJson(responseText)) as GeminiScheduleData;
        if (!Array.isArray(data.entries)) {
            return { success: false, error: 'OCR 返回的数据结构不正确', data: { entries: [] as GeminiScheduleEntry[] } };
        }

        return {
            success: true,
            data: {
                entries: data.entries
                    .map((item) => ({
                        week: item.week ? String(item.week).trim() : null,
                        date: String(item.date || '').trim().replace(/\//g, '-'),
                        time: String(item.time || '').trim(),
                        team1: String(item.team1 || '').trim(),
                        team2: String(item.team2 || '').trim(),
                        format: item.format ? String(item.format).trim().toUpperCase() : null,
                    }))
                    .filter((item) => item.date && item.time && item.team1 && item.team2),
            },
        };
    } catch (e: unknown) {
        console.error('Schedule Screenshot OCR Error:', e);
        const errorMsg = e instanceof Error ? e.message : String(e);
        return {
            success: false,
            error: `赛程截图识别失败：${errorMsg}`,
            data: { entries: [] as GeminiScheduleEntry[] },
        };
    }
}
