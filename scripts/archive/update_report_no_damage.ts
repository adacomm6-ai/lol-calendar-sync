import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

const JSON_FILE = path.join(process.cwd(), 'data', 'demacia_kda_results.json');
const EXCEL_FILE = path.join(process.cwd(), 'data', 'demacia_kda.xlsx');

async function main() {
    if (!fs.existsSync(JSON_FILE)) {
        console.error("JSON file not found.");
        return;
    }

    const rawData = fs.readFileSync(JSON_FILE, 'utf-8');
    const results = JSON.parse(rawData);

    const flatData: any[] = [];

    results.forEach((match: any) => {
        if (match.damage_data) {
            match.damage_data.forEach((p: any) => {
                flatData.push({
                    Match: match.filename,
                    Team: p.team,
                    Role: p.role,
                    Player: p.name,
                    Hero: p.hero,
                    Kills: p.kills,
                    Deaths: p.deaths,
                    Assists: p.assists,
                    // Damage removed as requested
                });
            });
        }
    });

    // Save Excel
    if (flatData.length > 0) {
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(flatData);
        xlsx.utils.book_append_sheet(wb, ws, "Demacia Cup KDA");
        xlsx.writeFile(wb, EXCEL_FILE);
        console.log(`Updated Excel report (removed Damage): ${EXCEL_FILE}`);
    }
}

main().catch(console.error);
