const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(projectRoot, 'prisma', 'schema.local.prisma');
const workspaceRootDbPath = path.resolve(projectRoot, '..', '..', 'prisma', 'dev.db');
const preferredDbPath = projectRoot.includes('__recovery_work__') ? workspaceRootDbPath : path.join(projectRoot, 'prisma', 'dev.db');
const localDatabaseUrl = `file:${preferredDbPath.replace(/\\/g, '/')}`;
const migrateScriptPaths = [
    path.join(projectRoot, 'scripts', 'migrate-local-player-model.js'),
    path.join(projectRoot, 'scripts', 'migrate-local-manual-review-data.js'),
];
const generatedSchemaPath = path.join(projectRoot, 'node_modules', '.prisma', 'client', 'schema.prisma');
const stateDir = path.join(projectRoot, '.cache');
const statePath = path.join(stateDir, 'prepare-local-state.json');

function readText(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function calcFingerprint() {
    const hash = crypto.createHash('sha256');
    hash.update(readText(schemaPath));
    for (const migrateScriptPath of migrateScriptPaths) {
        if (!fs.existsSync(migrateScriptPath)) continue;
        hash.update('\n---migrate-script---\n');
        hash.update(readText(migrateScriptPath));
    }
    return hash.digest('hex');
}

function readState() {
    if (!fs.existsSync(statePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch {
        return null;
    }
}

function writeState(fingerprint) {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
        statePath,
        JSON.stringify(
            {
                fingerprint,
                updatedAt: new Date().toISOString(),
            },
            null,
            2,
        ),
        'utf8',
    );
}

function sameSchemaAsGenerated() {
    if (!fs.existsSync(generatedSchemaPath)) return false;
    try {
        return readText(schemaPath) === readText(generatedSchemaPath);
    } catch {
        return false;
    }
}

function runNode(args) {
    const result = spawnSync(process.execPath, args, {
        cwd: projectRoot,
        stdio: 'inherit',
        env: {
            ...process.env,
            APP_DB_TARGET: 'local',
            DATABASE_URL: process.env.DATABASE_URL || localDatabaseUrl,
        },
    });
    return result.status === 0;
}

function runPrepareLocalForce() {
    if (!runNode(['scripts/migrate-local-player-model.js'])) return false;
    if (!runNode(['node_modules/prisma/build/index.js', 'generate', '--schema', 'prisma/schema.local.prisma'])) return false;
    if (!runNode(['node_modules/prisma/build/index.js', 'db', 'push', '--schema', 'prisma/schema.local.prisma', '--skip-generate'])) return false;
    if (!runNode(['scripts/migrate-local-manual-review-data.js'])) return false;
    return true;
}

function main() {
    const force = process.argv.includes('--force');
    const fingerprint = calcFingerprint();
    const state = readState();

    if (!force && state?.fingerprint === fingerprint) {
        console.log('[prepare:local] schema unchanged, skip prisma generate/db push.');
        return;
    }

    if (!force && !state && sameSchemaAsGenerated()) {
        writeState(fingerprint);
        console.log('[prepare:local] initialized from existing generated client, skip once.');
        return;
    }

    const ok = runPrepareLocalForce();
    if (!ok) {
        console.error('[prepare:local] failed.');
        console.error('[prepare:local] if you see query_engine-windows.dll.node EPERM, close local node processes and run: npm run prepare:local:force');
        process.exit(1);
    }

    writeState(fingerprint);
    console.log('[prepare:local] completed and cached.');
}

main();
