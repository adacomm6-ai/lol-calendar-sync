import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { join } from "path";
import { writeFile } from "fs/promises";
import * as fs from "fs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const player = await prisma.player.findUnique({ where: { id } });
    if (!player) {
      return new NextResponse("Player not found", { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new NextResponse("No file uploaded", { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return new NextResponse("Invalid file type", { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() || "png";
    const uploadDir = join(process.cwd(), "public", "uploads", "players");

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `${id}-${Date.now()}.${ext}`;
    const filePath = join(uploadDir, filename);

    await writeFile(filePath, buffer);

    const photoUrl = `/uploads/players/${filename}`;

    await prisma.player.update({
      where: { id },
      data: { photo: photoUrl },
    });

    return NextResponse.json({ photo: photoUrl });
  } catch (error) {
    console.error("Error uploading player photo:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
