import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function resolveLocalDatabaseUrl(): string {
  const raw = (process.env.DATABASE_URL || '').trim();
  const projectRoot = process.cwd();
  const prismaDbPath = path.join(projectRoot, 'prisma', 'dev.db');
  const rootDbPath = path.join(projectRoot, 'dev.db');
  const workspaceRootPrismaDbPath = path.resolve(projectRoot, '..', '..', 'prisma', 'dev.db');

  const hasPrismaDb = fs.existsSync(prismaDbPath) && fs.statSync(prismaDbPath).size > 0;
  const hasRootDb = fs.existsSync(rootDbPath) && fs.statSync(rootDbPath).size > 0;
  const hasWorkspaceRootPrismaDb =
    fs.existsSync(workspaceRootPrismaDbPath) && fs.statSync(workspaceRootPrismaDbPath).size > 0;

  if (raw.toLowerCase().startsWith('file:')) {
    if (raw === 'file:./dev.db' && hasPrismaDb) {
      return 'file:./prisma/dev.db';
    }
    return raw;
  }

  // Keep non-file DATABASE_URL values intact so cloud deployments use Postgres
  // instead of incorrectly falling back to a local SQLite path.
  if (raw) {
    return raw;
  }

  // When this app is launched from the recovery candidate under __recovery_work__,
  // prefer the workspace root database so the formal site always reads the current formal data.
  if (projectRoot.includes('__recovery_work__') && hasWorkspaceRootPrismaDb) {
    return `file:${workspaceRootPrismaDbPath.replace(/\\/g, '/')}`;
  }

  if (hasPrismaDb) return 'file:./prisma/dev.db';
  if (hasRootDb) return 'file:./dev.db';
  return 'file:./prisma/dev.db';
}

const url = resolveLocalDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query'],
    datasources: {
      db: {
        url,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
