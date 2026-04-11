import fs from 'fs';
import path from 'path';
import { analyzeImage } from '../../src/lib/gemini';
import dotenv from 'dotenv';
import xlsx from 'xlsx';

// Load env vars
dotenv.config();

const PICTURES_DIR = path.join(process.cwd(), 'pictures');
const OUTPUT_FILE = path.join(process.cwd(), 'data', 'demacia_kda_results.json');
const EXCEL_FILE = path.join(process.cwd(), 'data', 'demacia_kda.xlsx');

async function main() {
    console.log(`Scanning directory: ${PICTURES_DIR}`);

    if (!fs.existsSync(PICTURES_DIR)) {
        console.error(`Directory not found: ${PICTURES_DIR}`);
        return;
    }

    const files = fs.readdirSync(PICTURES_DIR).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));

    if (files.length === 0) {
        console.log("No images found.");
        return;
    }

    console.log(`Found ${files.length} images. Processing...`);
    const results: any[] = [];

    interface KdaRow {
        Match: string;
        Team: string;
        Role: string;
        Player: string;
        Hero: string;
        Kills: number;
        Deaths: number;
        Assists: number;
        Damage: number;
    }
    const flatData: KdaRow[] = [];

    for (const file of files) {
        console.log(`Analyzing: ${file}...`);
        const filePath = path.join(PICTURES_DIR, file);
        try {
            const buffer = fs.readFileSync(filePath);
            const analysis = await analyzeImage(buffer);
            if (analysis.success && analysis.data) {
                console.log(`  Success! Winner: ${analysis.data.winner}`);

                const matchData = {
                    filename: file,
                    ...analysis.data
                };
                results.push(matchData);

                // Flatten for Excel
                if (analysis.data.damage_data) {
                    analysis.data.damage_data.forEach((p: any) => {
                        flatData.push({
                            Match: file,
                            Team: p.team,
                            Role: p.role,
                            Player: p.name,
                            Hero: p.hero,
                            Kills: p.kills,
                            Deaths: p.deaths,
                            Assists: p.assists,
                            Damage: p.damage
                        });
                    });
                }

            } else {
                console.error(`  Failed analysis for ${file}:`, analysis.error);
            }
        } catch (e) {
            console.error(`  Error processing ${file}:`, e);
        }
    }

    // Save JSON
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`Saved JSON results to ${OUTPUT_FILE}`);

    // Save Excel
    if (flatData.length > 0) {
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(flatData);
        xlsx.utils.book_append_sheet(wb, ws, "Demacia Cup KDA");
        xlsx.writeFile(wb, EXCEL_FILE);
        console.log(`Saved Excel results to ${EXCEL_FILE}`);
    }
}

main().catch(console.error);
