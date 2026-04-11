
import { analyzeMatchHistoryImage } from '../../src/lib/gemini';
import fs from 'fs';
import path from 'path';

// Path to the uploaded image (Artifact Direct Access)
// Note: In real app, we might need to copy it or ensure access.
// Agent has full file system access.
const imagePath = 'C:/Users/WINDOWS/.gemini/antigravity/brain/dde910b4-51b2-465a-8bc8-7f689f108f95/uploaded_image_1768406398559.png';

async function main() {
    try {
        console.log(`Reading image from: ${imagePath}`);
        if (!fs.existsSync(imagePath)) {
            console.error("File does not exist!");
            return;
        }

        const buffer = fs.readFileSync(imagePath);
        console.log(`Image size: ${buffer.length} bytes`);

        console.log("Analyzing with Gemini...");
        const result = await analyzeMatchHistoryImage(buffer);

        if (result.success) {
            console.log("\n--- Analysis Success ---");
            console.log(JSON.stringify(result.data, null, 2));
        } else {
            console.error("\n--- Analysis Failed ---");
            console.error(result.error);
        }

    } catch (e) {
        console.error("Script Error:", e);
    }
}

main();
