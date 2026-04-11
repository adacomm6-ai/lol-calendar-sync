import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { join } from "path";
import { writeFile } from "fs/promises";
import * as fs from "fs";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Ensure team exists
        const team = await prisma.team.findUnique({ where: { id } });
        if (!team) {
            return new NextResponse("Team not found", { status: 404 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return new NextResponse("No file uploaded", { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // Validate MIME type roughly
        if (!file.type.startsWith("image/")) {
            return new NextResponse("Invalid file type", { status: 400 });
        }

        // Generate filename
        const ext = file.name.split(".").pop() || "png";
        const filename = `${id}-${Date.now()}.${ext}`;
        const uploadDir = join(process.cwd(), "public", "uploads");

        // Ensure upload directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filePath = join(uploadDir, filename);

        // Write file
        await writeFile(filePath, buffer);

        const logoUrl = `/uploads/${filename}`;

        await prisma.team.update({
            where: { id },
            data: { logo: logoUrl },
        });

        return NextResponse.json({ logo: logoUrl });

    } catch (error) {
        console.error("Error uploading team logo:", error);
        return new NextResponse("Internal server error", { status: 500 });
    }
}
