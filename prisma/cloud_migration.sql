-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "gameVersion" TEXT;

-- CreateTable
CREATE TABLE "GameVersionRule" (
    "id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameVersionRule_pkey" PRIMARY KEY ("id")
);

