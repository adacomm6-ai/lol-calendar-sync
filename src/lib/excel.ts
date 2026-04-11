import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface ExcelMatchRecord {
    Date: string; // YYYY-MM-DD
    Result: string; // WIN / LOSS
    Opponent: string;
    Game: number;
    Hero: string;
    KDA: string;
    Damage: number;
    MatchID: string; // For syncing back
    GameID: string;  // For syncing back
}

export function writePlayerMatchesToExcel(playerId: string, playerName: string, matches: ExcelMatchRecord[]) {
    // 1. Create Worksheet
    const ws = XLSX.utils.json_to_sheet(matches);

    // 2. Create Workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Match Records");

    // 3. Write File
    const fileName = `${playerName}_${playerId.substring(0, 6)}_records.xlsx`;
    const filePath = path.join(DATA_DIR, fileName);

    try {
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        fs.writeFileSync(filePath, buffer);
    } catch (e: any) {
        if (e.code === 'EBUSY' || e.code === 'EPERM') {
            throw new Error(`Cannot save file. Please close "${fileName}" if it is open in Excel.`);
        }
        throw e;
    }

    return fileName;
}

export function readPlayerMatchesFromExcel(fileName: string): ExcelMatchRecord[] {
    const filePath = path.join(DATA_DIR, fileName);

    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${fileName}`);
    }

    try {
        const wb = XLSX.readFile(filePath);
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        return XLSX.utils.sheet_to_json<ExcelMatchRecord>(ws);
    } catch (e: any) {
        // XLSX throws "Cannot access file" without code for some locks
        const msg = e.message || '';
        if (e.code === 'EBUSY' || e.code === 'EPERM' || msg.includes('Cannot access file') || msg.includes('file is open')) {
            throw new Error(`[Tip] Cannot read file. Please strictly CLOSE "${fileName}" in Excel and try again.`);
        }
        throw e;
    }
}

export function getExcelFilePath(fileName: string) {
    return path.join(DATA_DIR, fileName);
}
