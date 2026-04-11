const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);

dotenv.config({ path: path.join(projectRoot, '.env.local'), override: false, quiet: true });
dotenv.config({ path: path.join(projectRoot, '.env'), override: false, quiet: true });

const workspaceRootDbPath = path.resolve(projectRoot, '..', '..', 'prisma', 'dev.db');
const preferredDbPath = projectRoot.includes('__recovery_work__') ? workspaceRootDbPath : path.join(projectRoot, 'prisma', 'dev.db');
const absoluteDbPath = preferredDbPath.replace(/\\/g, '/');
process.env.APP_DB_TARGET = 'local';
process.env.DATABASE_URL = `file:${absoluteDbPath}`;
process.env.NODE_ENV = 'production';
process.env.ONECLICK_LOCAL_PROD = '1';

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || '127.0.0.1';
const rankSyncEnabled = String(process.env.RANK_SYNC_ENABLED || 'true').trim().toLowerCase() !== 'false';
const rankSyncIntervalMinutes = Math.max(30, Number(process.env.RANK_SYNC_INTERVAL_MINUTES || 360) || 360);
const rankSyncTimeoutMs = Math.max(60_000, Number(process.env.RANK_SYNC_TIMEOUT_MS || 900_000) || 900_000);
const rankSyncMaxRetries = Math.max(0, Number(process.env.RANK_SYNC_MAX_RETRIES || 2) || 2);
const rankSyncRetryDelayMs = Math.max(5_000, Number(process.env.RANK_SYNC_RETRY_DELAY_MS || 20_000) || 20_000);
const rankSyncFatalCooldownMs = Math.max(30 * 60 * 1000, Number(process.env.RANK_SYNC_FATAL_COOLDOWN_MS || 6 * 60 * 60 * 1000) || 6 * 60 * 60 * 1000);
const rankSyncStartupRecentSuccessMinutes = Math.max(
  30,
  Number(process.env.RANK_SYNC_STARTUP_RECENT_SUCCESS_MINUTES || 120) || 120,
);
const rankSyncWriteGuardPath = path.join(projectRoot, 'data', 'rank-sync-write-guard.json');
const rankSyncRunLockPath = path.join(projectRoot, 'data', 'rank-sync-run-lock.json');
const rankSyncHistoryPath = path.join(projectRoot, 'data', 'rank-sync-history.json');

console.log('[start-local-prod] APP_DB_TARGET=local');
console.log(`[start-local-prod] DATABASE_URL=${process.env.DATABASE_URL}`);
console.log(`[start-local-prod] CWD=${process.cwd()}`);
console.log(`[start-local-prod] Starting Next production server on http://${hostname}:${port}`);

const nextBin = require.resolve('next/dist/bin/next');
const child = spawn(process.execPath, [nextBin, 'start', '--hostname', hostname, '--port', String(port)], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

let rankSyncTimer = null;
let rankSyncRunning = false;
let rankSyncSuspendedUntil = 0;

function isFatalRankSyncError(message) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('entered unreachable code') ||
    text.includes('transaction already closed') ||
    text.includes('prismaclientrustpanicerror') ||
    text.includes('internal error') ||
    text.includes('p2028')
  );
}

function suspendRankSync(message) {
  rankSyncSuspendedUntil = Date.now() + rankSyncFatalCooldownMs;
  console.warn(
    `[start-local-prod] Rank sync suspended until ${new Date(rankSyncSuspendedUntil).toISOString()} due to fatal error: ${message}`,
  );
}

function readRankSyncGuard(filePath, fallbackSource, fallbackReason) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    const expiresAt = new Date(String(parsed.expiresAt || ''));
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return {
      source: String(parsed.source || fallbackSource),
      reason: String(parsed.reason || fallbackReason),
      expiresAt: expiresAt.toISOString(),
    };
  } catch {
    return null;
  }
}

function readRankSyncWriteGuard() {
  return readRankSyncGuard(rankSyncWriteGuardPath, 'unknown', 'manual write');
}

function readRankSyncRunLock() {
  return readRankSyncGuard(rankSyncRunLockPath, 'rank-sync', 'already running');
}

function hasRecentSuccessfulRankSync() {
  try {
    const raw = fs.readFileSync(rankSyncHistoryPath, 'utf8').replace(/^\uFEFF/, '');
    const history = JSON.parse(raw);
    if (!Array.isArray(history)) return false;

    const cutoff = Date.now() - rankSyncStartupRecentSuccessMinutes * 60 * 1000;
    return history.some((entry) => {
      if (entry?.status !== 'SUCCESS') return false;
      const finishedAt = new Date(String(entry.finishedAt || ''));
      return !Number.isNaN(finishedAt.getTime()) && finishedAt.getTime() >= cutoff;
    });
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function triggerRankSync(reason) {
  if (!rankSyncEnabled) return;
  if (rankSyncSuspendedUntil > Date.now()) {
    console.log(
      `[start-local-prod] Skip rank sync (${reason}): suspended until ${new Date(rankSyncSuspendedUntil).toISOString()}.`,
    );
    return;
  }
  const writeGuard = readRankSyncWriteGuard();
  if (writeGuard) {
    console.log(
      `[start-local-prod] Skip rank sync (${reason}): write guard active until ${writeGuard.expiresAt} (${writeGuard.source}: ${writeGuard.reason || 'manual write'}).`,
    );
    return;
  }
  const runLock = readRankSyncRunLock();
  if (runLock) {
    console.log(
      `[start-local-prod] Skip rank sync (${reason}): run lock active until ${runLock.expiresAt} (${runLock.source}: ${runLock.reason || 'already running'}).`,
    );
    return;
  }
  if (!process.env.CRON_SECRET) {
    console.warn('[start-local-prod] Skip rank sync: CRON_SECRET is missing.');
    return;
  }
  if (rankSyncRunning) {
    console.log('[start-local-prod] Skip rank sync: previous run still in progress.');
    return;
  }

  rankSyncRunning = true;
  try {
    const maxAttempts = rankSyncMaxRetries + 1;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), rankSyncTimeoutMs);

      try {
        console.log(`[start-local-prod] Triggering rank sync (${reason}) attempt ${attempt}/${maxAttempts}...`);
        const response = await fetch(`http://${hostname}:${port}/api/cron/rank-sync`, {
          method: 'GET',
          headers: {
            'x-cron-secret': process.env.CRON_SECRET,
          },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const errorMessage = `HTTP ${response.status}: ${payload.error || 'Unknown error'}`;
          if (isFatalRankSyncError(errorMessage)) {
            suspendRankSync(errorMessage);
          }
          throw new Error(errorMessage);
        }
        console.log(
          `[start-local-prod] Rank sync finished: refreshed=${payload.refreshedPlayers ?? '-'} failed=${payload.failedPlayers ?? '-'} note=${payload.note || 'ok'}`,
        );
        return;
      } catch (error) {
        lastError = error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (isFatalRankSyncError(errorMessage)) {
          suspendRankSync(errorMessage);
          break;
        }
        if (attempt >= maxAttempts) {
          console.warn(`[start-local-prod] Rank sync request error after ${maxAttempts} attempts: ${errorMessage}`);
          break;
        }
        console.warn(
          `[start-local-prod] Rank sync attempt ${attempt} failed: ${errorMessage}. ${Math.round(rankSyncRetryDelayMs / 1000)} 秒后重试...`,
        );
        await sleep(rankSyncRetryDelayMs);
      } finally {
        clearTimeout(timeout);
      }
    }

    if (lastError) {
      console.warn(
        `[start-local-prod] Rank sync ended with failure: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      );
    }
  } catch (error) {
    console.warn(`[start-local-prod] Rank sync request error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    rankSyncRunning = false;
  }
}

if (rankSyncEnabled) {
  const initialDelayMs = 20_000;
  rankSyncTimer = setInterval(() => {
    void triggerRankSync('interval');
  }, rankSyncIntervalMinutes * 60 * 1000);

  setTimeout(() => {
    if (hasRecentSuccessfulRankSync()) {
      console.log(
        `[start-local-prod] Skip startup rank sync: successful sync found in the last ${rankSyncStartupRecentSuccessMinutes} minutes.`,
      );
      return;
    }
    void triggerRankSync('startup');
  }, initialDelayMs);

  console.log(
    `[start-local-prod] Rank auto sync enabled. Interval=${rankSyncIntervalMinutes} minutes, timeout=${Math.round(rankSyncTimeoutMs / 1000)} seconds, retries=${rankSyncMaxRetries}, retryDelay=${Math.round(rankSyncRetryDelayMs / 1000)} seconds.`,
  );
}

child.on('exit', (code, signal) => {
  if (rankSyncTimer) clearInterval(rankSyncTimer);
  if (signal) {
    console.error(`[start-local-prod] Next exited with signal: ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
