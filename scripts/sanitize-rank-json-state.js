const fs = require('fs/promises');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

const TARGET_FILES = [
  path.join(projectRoot, 'data', 'rank-auto-import-last.json'),
  path.join(projectRoot, 'data', 'rank-sync-history.json'),
  path.join(projectRoot, 'data', 'rank-sync-failures.json'),
];

const TEXT_REPLACEMENTS = [
  ['閿?', '？'],
  ['閵?', '。'],
];

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    apply: args.has('--apply'),
    verbose: args.has('--verbose'),
  };
}

function repairText(value) {
  let text = String(value || '');
  for (const [from, to] of TEXT_REPLACEMENTS) {
    text = text.split(from).join(to);
  }
  return text;
}

function sanitizeDeep(value) {
  if (typeof value === 'string') {
    return repairText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDeep(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, sanitizeDeep(entryValue)]),
    );
  }

  return value;
}

async function main() {
  const { apply, verbose } = parseArgs(process.argv);
  const changed = [];

  for (const filePath of TARGET_FILES) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
      const sanitized = sanitizeDeep(parsed);
      const nextText = `${JSON.stringify(sanitized, null, 2)}\n`;

      if (nextText === raw || nextText === `${raw}\n`) continue;

      changed.push({
        filePath,
        nextText,
      });
    } catch (error) {
      changed.push({
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(`[sanitize-rank-json-state] mode=${apply ? 'apply' : 'dry-run'}`);
  console.log(`[sanitize-rank-json-state] touched=${changed.length}`);

  if (verbose) {
    for (const item of changed) {
      console.log(` - ${item.filePath}${item.error ? ` | skipped: ${item.error}` : ''}`);
    }
  }

  if (!apply) return;

  for (const item of changed) {
    if (item.error || !item.nextText) continue;
    await fs.writeFile(item.filePath, item.nextText, 'utf8');
  }
}

main().catch((error) => {
  console.error('[sanitize-rank-json-state] failed:', error);
  process.exitCode = 1;
});
