import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
    const gameId = 'b7384cc9-f56a-4e12-b04d-b2c2cb2a6efe'; // From previous step
    const game = await prisma.game.findUnique({ where: { id: gameId } });

    if (!game || !game.screenshot) {
        console.log("Game or screenshot missing.");
        return;
    }

    let relative = game.screenshot;
    if (relative.startsWith('/')) relative = relative.slice(1);
    const fullPath = path.join(process.cwd(), 'public', relative);

    if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        console.log(`File: ${fullPath}`);
        console.log(`Size: ${stats.size} bytes`);

        if (stats.size === 0) {
            console.log("WARNING: File matches but is empty (0 bytes).");
        } else {
            // Create a simple copy to test
            const destPath = path.join(process.cwd(), 'public', 'uploads', 'test_debug_img.png');
            fs.copyFileSync(fullPath, destPath);
            console.log(`Copied to ${destPath}`);

            // Update DB to point to simple name
            await prisma.game.update({
                where: { id: gameId },
                data: { screenshot: '/uploads/test_debug_img.png' }
            });
            console.log("Updated DB to use /uploads/test_debug_img.png");
        }
    } else {
        console.log("File went missing!");
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
