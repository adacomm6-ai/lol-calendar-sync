const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);

const absoluteDbPath = path.join(projectRoot, 'prisma', 'dev.db').replace(/\\/g, '/');
process.env.APP_DB_TARGET = 'local';
process.env.DATABASE_URL = `file:${absoluteDbPath}`;

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const SCOREGG_API_URL = 'https://www.scoregg.com/services/api_url.php';
const SCOREGG_LOL_GAME_ID = '1';
const SCOREGG_PAGE_SIZE = 12;
const SCOREGG_YEAR_PASSES = [2025, 2024, 2023, 2022];
const SCOREGG_REQUEST_DELAY_MS = 120;
const SCOREGG_MAX_RETRIES = 4;

const LEAGUEPEDIA_ENDPOINT = 'https://lol.fandom.com/api.php';
const LEAGUEPEDIA_PAGE_SIZE = 500;
const LEAGUEPEDIA_REQUEST_DELAY_MS = 2500;
const LEAGUEPEDIA_MAX_RETRIES = 8;
const LEAGUEPEDIA_PAGEIMAGE_BATCH_SIZE = 20;
const LEAGUEPEDIA_PAGEIMAGE_DELAY_MS = 1800;
const LEAGUEPEDIA_SEARCH_DELAY_MS = 1600;

const LOG_DIR = path.join(projectRoot, 'logs');
const LEAGUEPEDIA_CATALOG_CACHE_PATH = path.join(LOG_DIR, 'leaguepedia-players-catalog.json');
const LEAGUEPEDIA_PAGEIMAGE_CACHE_PATH = path.join(LOG_DIR, 'leaguepedia-player-page-images.json');
const LEAGUEPEDIA_SEARCH_CACHE_PATH = path.join(LOG_DIR, 'leaguepedia-player-search-cache.json');
const LEAGUEPEDIA_PARSED_PAGE_CACHE_PATH = path.join(LOG_DIR, 'leaguepedia-player-page-parse-cache.json');
const SCOREGG_TOURNAMENT_CACHE_PATH = path.join(LOG_DIR, 'scoregg-lol-tournament-list.json');
const SUMMARY_OUTPUT_PATH = path.join(LOG_DIR, 'fill-player-photos-summary.json');
const MISSING_OUTPUT_PATH = path.join(LOG_DIR, 'fill-player-photos-missing.json');

const TEAM_ALIAS_MAP = {
  '100': ['100 Thieves'],
  al: ["Anyone's Legend"],
  bds: ['Team BDS'],
  bfx: ['BNK FEARX', 'FearX'],
  blg: ['Bilibili Gaming'],
  bro: ['OKSavingsBank BRION', 'BRION'],
  c9: ['Cloud9'],
  cfo: ['CTBC Flying Oyster'],
  co: ['CAG OSAKA', 'CAG'],
  dcg: ['Deep Cross Gaming'],
  dfa: ['DetonatioN FocusMe Academy'],
  dfm: ['DetonatioN FocusMe'],
  dig: ['Dignitas'],
  dk: ['Dplus KIA'],
  dsg: ['Disguised'],
  dns: ['DN Freecs', 'Kwangdong Freecs'],
  edg: ['EDward Gaming'],
  fennel: ['FENNEL'],
  fly: ['FlyQuest'],
  fnc: ['Fnatic'],
  fox: ['BNK FEARX', 'FearX'],
  fur: ['FURIA'],
  furia: ['FUR'],
  fx7m: ['Fluxo W7M'],
  g2: ['G2 Esports'],
  gam: ['GAM Esports'],
  gen: ['Gen.G'],
  gz: ['Ground Zero Gaming'],
  gx: ['GIANTX'],
  hle: ['Hanwha Life Esports'],
  idt: ['Inferno Drive Tokyo'],
  ig: ['Invictus Gaming'],
  jdg: ['JD Gaming'],
  kc: ['Karmine Corp'],
  kcb: ['Karmine Corp Blue'],
  kt: ['KT Rolster'],
  lev: ['Leviatan'],
  lgd: ['LGD Gaming'],
  lgg: ['L Guide Gaming'],
  lng: ['LNG Esports'],
  lll: ['LOUD'],
  lr: ['Los Ratones'],
  mea: ['MVK Esports Academy'],
  mkoi: ['Movistar KOI'],
  navi: ['Natus Vincere'],
  nv: ['Natus Vincere'],
  nhe: ['Ngua Hi Esports', 'Ngua Hi', 'Ngua Hi Esports'],
  nip: ['Ninjas in Pyjamas', 'Ninjas in Pyjamas.CN'],
  nm: ['New Meta'],
  novex: ['NOVEX'],
  ns: ['Nongshim RedForce'],
  omg: ['Oh My God'],
  png: ['paiN Gaming'],
  prx: ['Paper Rex'],
  rc: ['RED Canids'],
  red: ['RED Canids'],
  rg: ['Rising Gaming'],
  rvx: ['Revolution Victory X'],
  sce: ['SN CyberCore Esports', 'CyberCore Esports'],
  sd: ['Saigon Dino'],
  shft: ['Shifters'],
  sk: ['SK Gaming'],
  sw: ['Saigon Warriors'],
  t1: ['T1'],
  tes: ['Top Esports'],
  th: ['Team Heretics'],
  tt: ['ThunderTalk Gaming'],
  uep: ['UEC eSports PlusPlus'],
  up: ['Ultra Prime'],
  vit: ['Team Vitality'],
  v3: ['V3 Esports'],
  vks: ['Vivo Keyd Stars'],
  vy: ['VARREL YOUTH'],
  wbg: ['Weibo Gaming'],
  we: ['Team WE'],
  yyg: ['Yang Yang Gaming'],
};

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
}

function normalizeRole(value) {
  const role = String(value || '').trim().toUpperCase();
  if (!role) return '';
  if (['TOP', 'TOPLANE', '上单'].includes(role)) return 'TOP';
  if (['JUN', 'JG', 'JUNGLE', '打野'].includes(role)) return 'JUN';
  if (['MID', 'MIDDLE', '中单'].includes(role)) return 'MID';
  if (['ADC', 'BOT', 'BOTTOM', 'CARRY', '下路', '射手'].includes(role)) return 'ADC';
  if (['SUP', 'SUPPORT', '辅助'].includes(role)) return 'SUP';
  return role;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildLeaguepediaPhotoUrl(image) {
  const raw = String(image || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const fileName = raw.replace(/^File:/i, '').trim();
  if (!fileName) return null;
  return `https://lol.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(fileName)}`;
}

function dedupeStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = normalizeText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function getPlayerNameVariants(player) {
  const variants = [player.name];
  const raw = String(player.name || '').trim();
  if (!raw) return dedupeStrings(variants);

  const words = raw.split(/\s+/).filter(Boolean);
  const teamCandidates = getTeamCandidateNames(player.team || {}).filter(Boolean);

  for (const teamCandidate of teamCandidates) {
    const escaped = escapeRegExp(teamCandidate.trim());
    if (!escaped) continue;
    const prefixRegex = new RegExp(`^${escaped}[\\s._-]+`, 'i');
    const stripped = raw.replace(prefixRegex, '').trim();
    if (stripped && stripped !== raw) {
      variants.push(stripped);
    }
  }

  if (words.length >= 2) {
    const first = words[0];
    const rest = words.slice(1).join(' ');
    if (rest) {
      const firstLooksLikeTag = /^[A-Z0-9]{2,6}$/i.test(first) || first.length <= 4;
      if (firstLooksLikeTag) {
        variants.push(rest);
      }
      if (words.length === 2) {
        variants.push(words[1]);
      }
    }
  }

  return dedupeStrings(variants);
}

function getBlindSearchNameVariants(player) {
  const variants = [...getPlayerNameVariants(player)];

  for (const variant of getPlayerNameVariants(player)) {
    const raw = String(variant || '').trim();
    if (!raw) continue;

    const normalized = normalizeText(raw);
    if (!normalized) continue;

    const simpleToken = raw.replace(/[^A-Za-z0-9]+/g, '');
    if (!simpleToken) continue;

    const simpleHasDigit = /\d/.test(simpleToken);
    const simpleLooksName = /^[A-Za-z0-9]{3,12}$/.test(simpleToken);
    if (!simpleLooksName || simpleHasDigit) continue;

    variants.push(`${simpleToken}1`);
    variants.push(`1${simpleToken}`);
  }

  return dedupeStrings(variants);
}

function getTeamCandidateNames(team) {
  const aliasValues = [];
  const keyCandidates = [normalizeText(team.name), normalizeText(team.shortName)];
  for (const key of keyCandidates) {
    const list = TEAM_ALIAS_MAP[key];
    if (Array.isArray(list)) aliasValues.push(...list);
  }

  const candidates = dedupeStrings([
    team.name,
    team.shortName,
    ...aliasValues,
    String(team.name || '').replace(/'/g, ''),
    String(team.name || '').replace(/[.]/g, ''),
    String(team.name || '').replace(/\s+Esports$/i, ''),
    String(team.name || '').replace(/\s+Gaming$/i, ''),
    String(team.name || '').replace(/\s+Academy$/i, ''),
    String(team.name || '').replace(/\s+Youth$/i, ''),
    String(team.name || '').replace(/\s+PlusPlus$/i, ''),
  ]);

  if (String(team.region || '').toUpperCase() === 'LPL') {
    return dedupeStrings([...candidates, ...candidates.map((item) => `${item}.CN`)]);
  }
  return candidates;
}

function getTeamMatchKeys(team) {
  return new Set(getTeamCandidateNames(team).map((item) => normalizeText(item)).filter(Boolean));
}

function isTeamCompatible(entryTeamName, teamKeys) {
  const target = normalizeText(entryTeamName);
  if (!target) return false;
  for (const candidate of teamKeys) {
    if (!candidate) continue;
    if (target === candidate) return true;
    if (target.includes(candidate) || candidate.includes(target)) return true;
  }
  return false;
}

function parseDateValue(dateText) {
  const text = String(dateText || '').trim();
  if (!text || text === '0000-00-00') return 0;
  const ts = Date.parse(text);
  return Number.isFinite(ts) ? ts : 0;
}

function extractTournamentYear(tournament) {
  const dateCandidates = [tournament.start_date, tournament.end_date];
  for (const dateText of dateCandidates) {
    const match = String(dateText || '').match(/^(\d{4})-/);
    if (match) return Number(match[1]);
  }

  const nameCandidates = [tournament.name, tournament.name_en, tournament.short_name, tournament.short_name_en];
  for (const text of nameCandidates) {
    const match = String(text || '').match(/\b(20\d{2})\b/);
    if (match) return Number(match[1]);
  }

  return 0;
}

function shouldIncludeTournament(tournament, yearCutoff) {
  const year = extractTournamentYear(tournament);
  return year >= yearCutoff;
}

async function fetchJson(url, options = {}, attempt = 0) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/plain, */*',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (attempt >= SCOREGG_MAX_RETRIES) {
      throw error;
    }
    await sleep(1000 * (attempt + 1));
    return fetchJson(url, options, attempt + 1);
  }
}

async function postScoregg(apiPath, params, refererTournamentId = '') {
  const body = new URLSearchParams({
    api_path: apiPath,
    method: 'post',
    platform: 'web',
    api_version: '9.9.9',
    language_id: '1',
    ...params,
  });

  const response = await fetchJson(SCOREGG_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Origin: 'https://www.scoregg.com',
      Referer: `https://www.scoregg.com/data/player${refererTournamentId ? `?tournamentID=${refererTournamentId}` : ''}`,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
  });

  if (String(response?.code) !== '200') {
    throw new Error(`Scoregg API failed: ${apiPath} => ${response?.code || 'unknown'} ${response?.message || ''}`);
  }

  return response;
}

function loadJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveJsonFile(filePath, value) {
  ensureLogDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function fetchScoreggTournamentList() {
  const cached = loadJsonFile(SCOREGG_TOURNAMENT_CACHE_PATH);
  if (Array.isArray(cached) && cached.length > 0) {
    return cached;
  }

  const response = await postScoregg('/services/match/tournament_list.php', {
    gameID: SCOREGG_LOL_GAME_ID,
  });

  const list = Array.isArray(response?.data?.list) ? response.data.list : [];
  saveJsonFile(SCOREGG_TOURNAMENT_CACHE_PATH, list);
  return list;
}

async function fetchScoreggPlayersPage(tournamentId, page) {
  const response = await postScoregg(
    '/services/gamingDatabase/match_data_ssdb_list.php',
    {
      tournament_id: String(tournamentId),
      type: 'player',
      order_type: 'KDA',
      order_value: 'DESC',
      team_name: '',
      player_name: '',
      positionID: '',
      page: String(page),
    },
    String(tournamentId),
  );

  const payload = response?.data?.data || {};
  return {
    count: Number(payload.count || 0),
    list: Array.isArray(payload.list) ? payload.list : [],
  };
}

async function fetchScoreggTournamentPlayers(tournament) {
  const all = [];
  let page = 1;
  let totalCount = 0;

  while (true) {
    const { count, list } = await fetchScoreggPlayersPage(tournament.tournamentID, page);
    totalCount = count;
    if (list.length === 0) break;

    for (const item of list) {
      if (!item?.player_name || !item?.player_image) continue;
      all.push({
        name: item.player_name,
        teamName: item.team_name || item.short_name || '',
        role: item.position || item.position_id || '',
        photo: item.player_image,
        tournamentId: String(item.tournament_id || tournament.tournamentID || ''),
        tournamentName: tournament.name || tournament.short_name || '',
        tournamentStartDate: tournament.start_date || '',
        updateTime: Number(item.update_time || 0),
      });
    }

    if (all.length >= totalCount || list.length < SCOREGG_PAGE_SIZE) break;

    page += 1;
    await sleep(SCOREGG_REQUEST_DELAY_MS);
  }

  return all;
}

function indexScoreggEntries(entriesByName, entries, localNameSet) {
  let kept = 0;
  for (const entry of entries) {
    const key = normalizeText(entry.name);
    if (!key || !localNameSet.has(key)) continue;
    if (!entriesByName.has(key)) entriesByName.set(key, []);
    entriesByName.get(key).push(entry);
    kept += 1;
  }
  return kept;
}

function sortScoreggCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const byUpdate = Number(b.updateTime || 0) - Number(a.updateTime || 0);
    if (byUpdate !== 0) return byUpdate;
    const byDate = parseDateValue(b.tournamentStartDate) - parseDateValue(a.tournamentStartDate);
    if (byDate !== 0) return byDate;
    return String(a.tournamentId).localeCompare(String(b.tournamentId));
  });
}

function chooseScoreggCandidate(player, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const teamKeys = getTeamMatchKeys(player.team);
  const playerRole = normalizeRole(player.role);
  const candidatesWithTeam = candidates.filter((candidate) => isTeamCompatible(candidate.teamName, teamKeys));
  const candidatesWithRoleAndTeam = candidatesWithTeam.filter(
    (candidate) => !playerRole || normalizeRole(candidate.role) === playerRole,
  );

  if (candidatesWithRoleAndTeam.length > 0) {
    return { source: 'scoregg-team-role', candidate: sortScoreggCandidates(candidatesWithRoleAndTeam)[0] };
  }

  if (candidatesWithTeam.length > 0) {
    return { source: 'scoregg-team', candidate: sortScoreggCandidates(candidatesWithTeam)[0] };
  }

  const uniqueTeams = new Set(candidates.map((candidate) => normalizeText(candidate.teamName)).filter(Boolean));
  const candidatesWithRole = candidates.filter((candidate) => !playerRole || normalizeRole(candidate.role) === playerRole);

  if (uniqueTeams.size <= 1 && candidatesWithRole.length > 0) {
    return { source: 'scoregg-single-team', candidate: sortScoreggCandidates(candidatesWithRole)[0] };
  }

  if (candidates.length === 1 && (!playerRole || normalizeRole(candidates[0].role) === playerRole)) {
    return { source: 'scoregg-single-candidate', candidate: candidates[0] };
  }

  return null;
}

async function fetchLeaguepediaJson(url, attempt = 0) {
  if (attempt > 0) {
    const wait = Math.max(12000, LEAGUEPEDIA_REQUEST_DELAY_MS * (attempt + 2) * 2);
    await sleep(wait);
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Leaguepedia HTTP ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data?.error?.code === 'ratelimited') {
    if (attempt >= LEAGUEPEDIA_MAX_RETRIES) {
      throw new Error(`Leaguepedia rate limited: ${url}`);
    }
    return fetchLeaguepediaJson(url, attempt + 1);
  }

  return data;
}

async function fetchLeaguepediaPlayersPage(offset) {
  const params = new URLSearchParams({
    action: 'cargoquery',
    format: 'json',
    tables: 'Players=P',
    fields: 'P.ID=ID, P.Team=Team, P.Role=Role, P.Image=Image',
    limit: String(LEAGUEPEDIA_PAGE_SIZE),
    offset: String(offset),
  });

  const data = await fetchLeaguepediaJson(`${LEAGUEPEDIA_ENDPOINT}?${params.toString()}`);
  return Array.isArray(data?.cargoquery)
    ? data.cargoquery.map((item) => ({
        id: item?.title?.ID || '',
        team: item?.title?.Team || '',
        role: item?.title?.Role || '',
        image: item?.title?.Image || '',
      }))
    : [];
}

async function fetchAllLeaguepediaPlayersCatalog() {
  const all = [];
  let offset = 0;

  while (true) {
    const page = await fetchLeaguepediaPlayersPage(offset);
    if (page.length === 0) break;
    all.push(...page);
    if (page.length < LEAGUEPEDIA_PAGE_SIZE) break;
    offset += LEAGUEPEDIA_PAGE_SIZE;
    await sleep(LEAGUEPEDIA_REQUEST_DELAY_MS);
  }

  return all;
}

function loadLeaguepediaCatalogCache() {
  const cached = loadJsonFile(LEAGUEPEDIA_CATALOG_CACHE_PATH);
  return Array.isArray(cached) ? cached : null;
}

function scoreLeaguepediaCandidate(entry, player, teamKeys, candidateCount, nameKeys, exactNames) {
  let score = 0;
  const hasPhoto = Boolean(buildLeaguepediaPhotoUrl(entry.image));
  const hasTeam = Boolean(normalizeText(entry.team));
  const roleMatch = normalizeRole(entry.role) === normalizeRole(player.role);
  const teamMatch = isTeamCompatible(entry.team, teamKeys);
  const normalizedId = normalizeText(entry.id);

  if (nameKeys.has(normalizedId)) score += 70;
  if (exactNames.has(String(entry.id || '').trim())) score += 15;
  if (teamMatch) score += 60;
  if (roleMatch) score += 20;
  if (hasPhoto) score += 20;
  if (!hasTeam && candidateCount === 1 && roleMatch && hasPhoto) score += 10;

  return score;
}

function chooseLeaguepediaCandidate(player, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const teamKeys = getTeamMatchKeys(player.team);
  const nameVariants = getPlayerNameVariants(player);
  const nameKeys = new Set(nameVariants.map((value) => normalizeText(value)).filter(Boolean));
  const exactNames = new Set(nameVariants.map((value) => String(value || '').trim()).filter(Boolean));

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreLeaguepediaCandidate(candidate, player, teamKeys, candidates.length, nameKeys, exactNames),
      photo: buildLeaguepediaPhotoUrl(candidate.image),
    }))
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return null;
  if (ranked[0].score >= 90) return ranked[0];
  if (ranked.length === 1 && ranked[0].score >= 80) return ranked[0];
  return null;
}

function buildPlayerNameMap(players) {
  const map = new Map();
  for (const player of players) {
    if (!player?.photo) continue;
    for (const variant of getPlayerNameVariants(player)) {
      const key = normalizeText(variant);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(player);
    }
  }
  return map;
}

function chooseLocalPhotoCandidate(player, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const teamKeys = getTeamMatchKeys(player.team);
  const playerRole = normalizeRole(player.role);
  const teamAndRole = candidates.filter(
    (candidate) => isTeamCompatible(candidate.team?.name, teamKeys) && normalizeRole(candidate.role) === playerRole,
  );
  if (teamAndRole.length > 0) return teamAndRole[0];

  const byTeam = candidates.filter((candidate) => isTeamCompatible(candidate.team?.name, teamKeys));
  if (byTeam.length > 0) return byTeam[0];

  const byRole = candidates.filter((candidate) => normalizeRole(candidate.role) === playerRole);
  if (byRole.length === 1) return byRole[0];

  return null;
}

function buildLeaguepediaCandidatesMap(catalog) {
  const map = new Map();
  for (const item of catalog) {
    const key = normalizeText(item.id);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function loadLeaguepediaPageImageCache() {
  const cached = loadJsonFile(LEAGUEPEDIA_PAGEIMAGE_CACHE_PATH);
  if (!cached || typeof cached !== 'object' || Array.isArray(cached)) return {};
  return cached;
}

function saveLeaguepediaPageImageCache(cache) {
  saveJsonFile(LEAGUEPEDIA_PAGEIMAGE_CACHE_PATH, cache);
}

function loadLeaguepediaSearchCache() {
  const cached = loadJsonFile(LEAGUEPEDIA_SEARCH_CACHE_PATH);
  if (!cached || typeof cached !== 'object' || Array.isArray(cached)) return {};
  return cached;
}

function saveLeaguepediaSearchCache(cache) {
  saveJsonFile(LEAGUEPEDIA_SEARCH_CACHE_PATH, cache);
}

function loadLeaguepediaParsedPageCache() {
  const cached = loadJsonFile(LEAGUEPEDIA_PARSED_PAGE_CACHE_PATH);
  if (!cached || typeof cached !== 'object' || Array.isArray(cached)) return {};
  return cached;
}

function saveLeaguepediaParsedPageCache(cache) {
  saveJsonFile(LEAGUEPEDIA_PARSED_PAGE_CACHE_PATH, cache);
}

function extractLeaguepediaInfoboxImageFromHtml(html) {
  const text = String(html || '');
  if (!text) return null;

  const infoboxMatch =
    text.match(/<table[^>]+class="[^"]*InfoboxPlayer[^"]*"[\s\S]*?<\/table>/i) ||
    text.match(/<table[^>]+class="[^"]*InfoboxPerson[^"]*"[\s\S]*?<\/table>/i);
  if (!infoboxMatch) return null;

  const infoboxHtml = infoboxMatch[0];
  const dataSrcMatch = infoboxHtml.match(/data-src="([^"]+)"/i);
  if (dataSrcMatch?.[1]) {
    const imageUrl = dataSrcMatch[1].replace(/&amp;/g, '&');
    if (!/Unknown_Infobox_Image_-_Player\.png/i.test(imageUrl)) return imageUrl;
  }

  const srcMatch = infoboxHtml.match(/<img[^>]+src="([^"]+)"/i);
  if (srcMatch?.[1]) {
    const imageUrl = srcMatch[1].replace(/&amp;/g, '&');
    if (!/Unknown_Infobox_Image_-_Player\.png/i.test(imageUrl)) return imageUrl;
  }

  const hrefMatch = infoboxHtml.match(/<a[^>]+href="(https:\/\/static\.wikia\.nocookie\.net\/[^"]+)"/i);
  if (hrefMatch?.[1]) {
    const imageUrl = hrefMatch[1].replace(/&amp;/g, '&');
    if (!/Unknown_Infobox_Image_-_Player\.png/i.test(imageUrl)) return imageUrl;
  }

  return null;
}

function extractLeaguepediaParsedPlayerMeta(wikitext) {
  const text = String(wikitext || '');
  const isPlayerPage = /\{\{\s*Infobox Player\b/i.test(text) || /\|\s*page_type\s*=\s*Player\b/i.test(text);
  const redirectMatch = text.match(/^#redirect\s*\[\[([^\]#]+)(?:#[^\]]*)?\]\]/im);
  const idMatch = text.match(/\|\s*id\s*=\s*([^\n|]+)/i);
  const roleMatch = text.match(/\|\s*role\s*=\s*([^\n|]+)/i);
  return {
    isPlayerPage,
    redirectTarget: redirectMatch ? String(redirectMatch[1]).trim() : '',
    infoboxId: idMatch ? String(idMatch[1]).trim().replace(/'''/g, '') : '',
    infoboxRole: roleMatch ? String(roleMatch[1]).trim() : '',
  };
}

async function fetchLeaguepediaParsedPage(title) {
  const params = new URLSearchParams({
    action: 'parse',
    format: 'json',
    page: title,
    prop: 'text|wikitext',
  });

  const data = await fetchLeaguepediaJson(`${LEAGUEPEDIA_ENDPOINT}?${params.toString()}`);
  return {
    html: data?.parse?.text?.['*'] || '',
    wikitext: data?.parse?.wikitext?.['*'] || '',
  };
}

async function resolveLeaguepediaParsedPage(title, parsedPageCache) {
  if (Object.prototype.hasOwnProperty.call(parsedPageCache, title)) {
    return parsedPageCache[title];
  }

  const parsed = await fetchLeaguepediaParsedPage(title);
  const meta = extractLeaguepediaParsedPlayerMeta(parsed.wikitext);
  const image = extractLeaguepediaInfoboxImageFromHtml(parsed.html);

  let payload = {
    ...meta,
    image: image || null,
  };

  if (meta.redirectTarget && normalizeText(meta.redirectTarget) !== normalizeText(title)) {
    const targetPayload = await resolveLeaguepediaParsedPage(meta.redirectTarget, parsedPageCache);
    payload = {
      ...targetPayload,
      redirectTarget: meta.redirectTarget,
    };
  }

  parsedPageCache[title] = payload;
  saveLeaguepediaParsedPageCache(parsedPageCache);
  return payload;
}

async function fetchLeaguepediaPageImageBatch(titles) {
  const filteredTitles = dedupeStrings(titles);
  if (filteredTitles.length === 0) return {};

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    redirects: '1',
    prop: 'pageimages',
    piprop: 'original',
    titles: filteredTitles.join('|'),
  });

  const data = await fetchLeaguepediaJson(`${LEAGUEPEDIA_ENDPOINT}?${params.toString()}`);
  const result = {};
  const pages = data?.query?.pages || {};
  const normalizedMap = new Map();

  for (const item of data?.query?.normalized || []) {
    normalizedMap.set(normalizeText(item.from), item.to);
  }
  for (const item of data?.query?.redirects || []) {
    normalizedMap.set(normalizeText(item.from), item.to);
  }

  const pageByTitle = new Map();
  for (const page of Object.values(pages)) {
    if (!page || typeof page !== 'object') continue;
    const titleKey = normalizeText(page.title);
    if (!titleKey) continue;
    pageByTitle.set(titleKey, page.original?.source || null);
  }

  for (const title of filteredTitles) {
    let resolvedTitle = title;
    for (let index = 0; index < 3; index += 1) {
      const nextTitle = normalizedMap.get(normalizeText(resolvedTitle));
      if (!nextTitle || normalizeText(nextTitle) === normalizeText(resolvedTitle)) break;
      resolvedTitle = nextTitle;
    }

    result[title] = pageByTitle.get(normalizeText(resolvedTitle)) || null;
  }

  return result;
}

async function fetchLeaguepediaSearchTitles(query) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    list: 'search',
    srsearch: query,
    srlimit: '10',
  });

  const data = await fetchLeaguepediaJson(`${LEAGUEPEDIA_ENDPOINT}?${params.toString()}`);
  const list = Array.isArray(data?.query?.search) ? data.query.search : [];
  return list.map((item) => item?.title).filter(Boolean);
}

function normalizeLeaguepediaSearchTitle(title) {
  return String(title || '')
    .replace(/\/(Match History|Schedule History|Tournament Results|Statistics(?:\/\d{4})?)$/i, '')
    .trim();
}

function normalizeLeaguepediaBaseTitle(title) {
  return normalizeText(
    normalizeLeaguepediaSearchTitle(title)
      .replace(/\s*\([^)]*\)\s*$/g, '')
      .trim(),
  );
}

function scoreLeaguepediaSearchTitle(title, player, candidateId, nameKeys) {
  const normalizedTitle = normalizeText(title);
  const normalizedBase = normalizeText(normalizeLeaguepediaSearchTitle(title));
  const candidateKey = normalizeText(candidateId);
  const teamKeys = getTeamMatchKeys(player.team);
  let score = 0;

  if (candidateKey && normalizedBase === candidateKey) score += 120;
  if (candidateKey && normalizedTitle.includes(candidateKey)) score += 80;
  if (candidateKey && normalizedBase.includes(candidateKey)) score += 80;
  if (nameKeys.has(normalizedBase)) score += 70;
  if (title.includes('(')) score += 10;
  if (title.includes('/')) score -= 5;

  for (const teamKey of teamKeys) {
    if (!teamKey) continue;
    if (normalizedTitle === teamKey) score -= 80;
    if (normalizedTitle.includes(teamKey)) score += 20;
  }

  return score;
}

async function resolveLeaguepediaSearchPageImages(pendingPlayers, pageImageCache, searchCache, parsedPageCache) {
  const resolved = new Map();

  for (const pending of pendingPlayers) {
    const nameVariants = getPlayerNameVariants(pending.player);
    const nameKeys = new Set(nameVariants.map((value) => normalizeText(value)).filter(Boolean));
    const searchQueries = dedupeStrings([
      `${pending.candidateId} ${pending.player.team?.name || ''}`.trim(),
      `${pending.candidateId} ${pending.player.team?.shortName || ''}`.trim(),
      ...nameVariants.map((value) => `${value} ${pending.player.team?.name || ''}`.trim()),
    ]);

    let candidateTitles = [];
    for (const query of searchQueries) {
      if (!query) continue;
      if (!Array.isArray(searchCache[query])) {
        searchCache[query] = await fetchLeaguepediaSearchTitles(query);
        saveLeaguepediaSearchCache(searchCache);
        await sleep(LEAGUEPEDIA_SEARCH_DELAY_MS);
      }
      candidateTitles.push(...searchCache[query]);
    }

    candidateTitles = dedupeStrings(candidateTitles)
      .concat(dedupeStrings([pending.candidateId, ...nameVariants]))
      .map((title) => normalizeLeaguepediaSearchTitle(title))
      .filter(Boolean);

    if (candidateTitles.length === 0) continue;

    const pageImages = await resolveLeaguepediaPageImages(candidateTitles, pageImageCache);
    const ranked = candidateTitles
      .map((title) => {
        const parsed = parsedPageCache[title];
        const parsedImage = parsed?.image || null;
        const parsedIsPlayer = Boolean(parsed?.isPlayerPage);
        const parsedId = normalizeText(parsed?.infoboxId || '');
        const parsedRedirectKey = normalizeLeaguepediaBaseTitle(parsed?.redirectTarget || '');
        let score = scoreLeaguepediaSearchTitle(title, pending.player, pending.candidateId, nameKeys);
        if (parsedIsPlayer) score += 80;
        if (parsedId && (parsedId === normalizeText(pending.candidateId) || nameKeys.has(parsedId))) score += 60;
        if (parsedRedirectKey && (parsedRedirectKey === normalizeText(pending.candidateId) || nameKeys.has(parsedRedirectKey))) {
          score += 60;
        }
        if (!parsedIsPlayer && normalizeText(title) === normalizeText(pending.candidateId)) score -= 140;
        return {
          title,
          photo: parsedImage || pageImages[title] || null,
          parsedNeeded: !parsed,
          score,
        };
      })
      .filter((item) => item.photo)
      .sort((a, b) => b.score - a.score);

    const needsParse = ranked.filter((item) => item.parsedNeeded).slice(0, 5);
    for (const item of needsParse) {
      const parsed = await resolveLeaguepediaParsedPage(item.title, parsedPageCache);
      item.photo = parsed.image || item.photo;
      if (parsed.isPlayerPage) item.score += 80;
      const parsedId = normalizeText(parsed.infoboxId || '');
      if (parsedId && (parsedId === normalizeText(pending.candidateId) || nameKeys.has(parsedId))) item.score += 60;
      const parsedRedirectKey = normalizeLeaguepediaBaseTitle(parsed.redirectTarget || '');
      if (parsedRedirectKey && (parsedRedirectKey === normalizeText(pending.candidateId) || nameKeys.has(parsedRedirectKey))) {
        item.score += 60;
      }
      if (!parsed.isPlayerPage && normalizeText(item.title) === normalizeText(pending.candidateId)) item.score -= 140;
    }

    ranked.sort((a, b) => b.score - a.score);
    if (ranked.length > 0) {
      resolved.set(pending.player.id, ranked[0].photo);
    }
  }

  return resolved;
}

function scoreLeaguepediaBlindSearchTitle(title, player, nameKeys, teamKeys, candidateEntries) {
  const normalizedTitle = normalizeText(title);
  const normalizedBase = normalizeLeaguepediaBaseTitle(title);
  let score = 0;

  if (nameKeys.has(normalizedBase)) score += 100;
  if (nameKeys.has(normalizedTitle)) score += 80;

  for (const key of nameKeys) {
    if (!key) continue;
    if (key.length >= 5 && (normalizedBase.includes(key) || key.includes(normalizedBase))) {
      score += 35;
    }
    if (key.length >= 5 && (normalizedTitle.includes(key) || key.includes(normalizedTitle))) {
      score += 20;
    }
  }

  if (!title.includes('/')) score += 10;
  if (title.includes('(')) score += 5;

  const playerRole = normalizeRole(player.role);
  for (const entry of candidateEntries) {
    if (!entry) continue;
    if (isTeamCompatible(entry.team, teamKeys)) score += 60;
    if (playerRole && normalizeRole(entry.role) === playerRole) score += 20;
  }

  return score;
}

async function resolveLeaguepediaBlindSearchPageImages(players, candidatesByName, pageImageCache, searchCache, parsedPageCache) {
  const resolved = new Map();

  for (const player of players) {
    const nameVariants = getBlindSearchNameVariants(player);
    const nameKeys = new Set(nameVariants.map((value) => normalizeText(value)).filter(Boolean));
    const teamKeys = getTeamMatchKeys(player.team);
    const searchQueries = dedupeStrings([
      ...nameVariants.map((value) => `${value} ${player.team?.name || ''}`.trim()),
      ...nameVariants.map((value) => `${value} ${player.team?.shortName || ''}`.trim()),
      ...nameVariants,
    ]);

    let candidateTitles = [];
    for (const query of searchQueries) {
      if (!query) continue;
      if (!Array.isArray(searchCache[query])) {
        searchCache[query] = await fetchLeaguepediaSearchTitles(query);
        saveLeaguepediaSearchCache(searchCache);
        await sleep(LEAGUEPEDIA_SEARCH_DELAY_MS);
      }
      candidateTitles.push(...searchCache[query]);
    }

    candidateTitles = dedupeStrings(candidateTitles)
      .concat(nameVariants)
      .map((title) => normalizeLeaguepediaSearchTitle(title))
      .filter(Boolean);

    if (candidateTitles.length === 0) continue;

    const pageImages = await resolveLeaguepediaPageImages(candidateTitles, pageImageCache);
    const ranked = candidateTitles
      .map((title) => {
        const parsed = parsedPageCache[title];
        const photo = parsed?.image || pageImages[title] || null;
        const candidateEntries =
          candidatesByName.get(normalizeLeaguepediaBaseTitle(title)) ||
          candidatesByName.get(normalizeLeaguepediaBaseTitle(parsed?.redirectTarget || '')) ||
          candidatesByName.get(normalizeText(title)) ||
          [];
        const compatibleEntries = candidateEntries.filter((entry) => isTeamCompatible(entry.team, teamKeys));
        const parsedIsPlayer = Boolean(parsed?.isPlayerPage);
        const parsedId = normalizeText(parsed?.infoboxId || '');
        const parsedRedirectKey = normalizeLeaguepediaBaseTitle(parsed?.redirectTarget || '');
        let score = scoreLeaguepediaBlindSearchTitle(title, player, nameKeys, teamKeys, compatibleEntries);
        if (parsedIsPlayer) score += 80;
        if (parsedId && nameKeys.has(parsedId)) score += 60;
        if (parsedRedirectKey && nameKeys.has(parsedRedirectKey)) score += 60;
        if (!parsedIsPlayer && compatibleEntries.length === 0) score -= 120;

        return {
          title,
          photo,
          compatibleEntries,
          parsedNeeded: !parsed,
          score,
        };
      })
      .filter((item) => item.photo && item.compatibleEntries.length > 0)
      .sort((a, b) => b.score - a.score);

    const needsParse = ranked.filter((item) => item.parsedNeeded).slice(0, 5);
    for (const item of needsParse) {
      const parsed = await resolveLeaguepediaParsedPage(item.title, parsedPageCache);
      item.photo = parsed.image || item.photo;
      if (parsed.isPlayerPage) item.score += 80;
      const parsedId = normalizeText(parsed.infoboxId || '');
      if (parsedId && nameKeys.has(parsedId)) item.score += 60;
      const parsedRedirectKey = normalizeLeaguepediaBaseTitle(parsed.redirectTarget || '');
      if (parsedRedirectKey && nameKeys.has(parsedRedirectKey)) item.score += 60;
      if (!parsed.isPlayerPage) item.score -= 120;
    }

    ranked.sort((a, b) => b.score - a.score);
    if (ranked.length > 0 && ranked[0].score >= 160) {
      resolved.set(player.id, ranked[0].photo);
    }
  }

  return resolved;
}

async function resolveLeaguepediaPageImages(titles, pageImageCache) {
  const resolved = {};
  const missingTitles = [];

  for (const title of dedupeStrings(titles)) {
    if (Object.prototype.hasOwnProperty.call(pageImageCache, title)) {
      resolved[title] = pageImageCache[title];
      continue;
    }
    missingTitles.push(title);
  }

  for (let index = 0; index < missingTitles.length; index += LEAGUEPEDIA_PAGEIMAGE_BATCH_SIZE) {
    const batch = missingTitles.slice(index, index + LEAGUEPEDIA_PAGEIMAGE_BATCH_SIZE);
    const batchResult = await fetchLeaguepediaPageImageBatch(batch);
    for (const title of batch) {
      const source = batchResult[title] || null;
      pageImageCache[title] = source;
      resolved[title] = source;
    }
    saveLeaguepediaPageImageCache(pageImageCache);
    if (index + LEAGUEPEDIA_PAGEIMAGE_BATCH_SIZE < missingTitles.length) {
      await sleep(LEAGUEPEDIA_PAGEIMAGE_DELAY_MS);
    }
  }

  return resolved;
}

async function applyUpdates(updates) {
  const entries = Array.from(updates.entries());
  const chunkSize = 50;
  for (let index = 0; index < entries.length; index += chunkSize) {
    const chunk = entries.slice(index, index + chunkSize);
    await prisma.$transaction(
      chunk.map(([id, photo]) =>
        prisma.player.update({
          where: { id },
          data: { photo },
        }),
      ),
    );
  }
}

async function main() {
  ensureLogDir();

  console.log('[fill-player-photos] start');
  console.log(`[fill-player-photos] APP_DB_TARGET=${process.env.APP_DB_TARGET}`);
  console.log(`[fill-player-photos] DATABASE_URL=${process.env.DATABASE_URL}`);

  const teams = await prisma.team.findMany({
    include: { players: true },
    orderBy: [{ region: 'asc' }, { name: 'asc' }],
  });

  const totalPlayers = await prisma.player.count();
  const allPlayers = teams.flatMap((team) => team.players.map((player) => ({ ...player, team })));
  const playersNeedingPhoto = allPlayers.filter((player) => !player.photo);
  const localNameSet = new Set(
    playersNeedingPhoto.flatMap((player) => getPlayerNameVariants(player).map((name) => normalizeText(name))).filter(Boolean),
  );

  console.log(
    `[fill-player-photos] totalPlayers=${totalPlayers} needPhoto=${playersNeedingPhoto.length} uniqueNames=${localNameSet.size}`,
  );

  const scoreggStats = {
    tournamentsSeen: 0,
    tournamentsFetched: 0,
    entriesIndexed: 0,
    matchedPlayers: 0,
  };

  const updates = new Map();
  const matchedByScoregg = new Set();
  const remainingPlayers = new Map(playersNeedingPhoto.map((player) => [player.id, player]));
  const localPhotoMap = buildPlayerNameMap(allPlayers);
  const scoreggEntriesByName = new Map();
  const fetchedTournamentIds = new Set();
  let localCarryMatched = 0;

  const tournamentList = await fetchScoreggTournamentList();
  scoreggStats.tournamentsSeen = tournamentList.length;

  const sortedTournaments = [...tournamentList].sort((a, b) => {
    const byDate = parseDateValue(b.start_date) - parseDateValue(a.start_date);
    if (byDate !== 0) return byDate;
    return Number(b.tournamentID || 0) - Number(a.tournamentID || 0);
  });

  for (const yearCutoff of SCOREGG_YEAR_PASSES) {
    const targetTournaments = sortedTournaments.filter(
      (tournament) => !fetchedTournamentIds.has(String(tournament.tournamentID)) && shouldIncludeTournament(tournament, yearCutoff),
    );

    console.log(
      `[fill-player-photos] scoregg pass year>=${yearCutoff} tournaments=${targetTournaments.length} remaining=${remainingPlayers.size}`,
    );

    for (const tournament of targetTournaments) {
      try {
        const entries = await fetchScoreggTournamentPlayers(tournament);
        scoreggStats.tournamentsFetched += 1;
        scoreggStats.entriesIndexed += indexScoreggEntries(scoreggEntriesByName, entries, localNameSet);
      } catch (error) {
        console.warn(
          `[fill-player-photos] scoregg tournament failed id=${tournament.tournamentID} name=${tournament.name}: ${error.message}`,
        );
      }

      fetchedTournamentIds.add(String(tournament.tournamentID));
      await sleep(SCOREGG_REQUEST_DELAY_MS);
    }

    for (const player of Array.from(remainingPlayers.values())) {
      const candidates = Array.from(
        new Map(
          getPlayerNameVariants(player)
            .flatMap((name) => scoreggEntriesByName.get(normalizeText(name)) || [])
            .map((candidate) => [`${candidate.tournamentId}:${candidate.teamName}:${candidate.name}:${candidate.photo}`, candidate]),
        ).values(),
      );
      const match = chooseScoreggCandidate(player, candidates);
      if (!match?.candidate?.photo) continue;

      updates.set(player.id, match.candidate.photo);
      matchedByScoregg.add(player.id);
      remainingPlayers.delete(player.id);
    }

    console.log(
      `[fill-player-photos] scoregg pass year>=${yearCutoff} matched=${matchedByScoregg.size} remaining=${remainingPlayers.size}`,
    );

    if (remainingPlayers.size === 0) break;
  }

  scoreggStats.matchedPlayers = matchedByScoregg.size;

  for (const player of Array.from(remainingPlayers.values())) {
    const candidates = Array.from(
      new Map(
        getPlayerNameVariants(player)
          .flatMap((name) => localPhotoMap.get(normalizeText(name)) || [])
          .map((candidate) => [candidate.id, candidate]),
      ).values(),
    ).filter((candidate) => candidate.id !== player.id && candidate.photo);

    const match = chooseLocalPhotoCandidate(player, candidates);
    if (!match?.photo) continue;

    updates.set(player.id, match.photo);
    localCarryMatched += 1;
    remainingPlayers.delete(player.id);
  }

  let leaguepediaMatched = 0;
  let leaguepediaPageImageMatched = 0;
  let leaguepediaSearchMatched = 0;
  if (remainingPlayers.size > 0) {
    let catalog = loadLeaguepediaCatalogCache();
    if (!catalog || catalog.length === 0) {
      console.log('[fill-player-photos] leaguepedia cache missing, fetching catalog');
      catalog = await fetchAllLeaguepediaPlayersCatalog();
      saveJsonFile(LEAGUEPEDIA_CATALOG_CACHE_PATH, catalog);
    } else {
      console.log(`[fill-player-photos] leaguepedia cache loaded ${catalog.length}`);
    }

    const candidatesByName = buildLeaguepediaCandidatesMap(catalog);
    const pageImageCache = loadLeaguepediaPageImageCache();
    const searchCache = loadLeaguepediaSearchCache();
    const parsedPageCache = loadLeaguepediaParsedPageCache();
    const pendingPageTitles = new Set();
    const pendingPlayers = [];

    for (const player of Array.from(remainingPlayers.values())) {
      const candidates = Array.from(
        new Map(
          getPlayerNameVariants(player)
            .flatMap((name) => candidatesByName.get(normalizeText(name)) || [])
            .map((candidate) => [`${candidate.id}:${candidate.team}:${candidate.role}:${candidate.image}`, candidate]),
        ).values(),
      );
      const match = chooseLeaguepediaCandidate(player, candidates);
      if (!match) continue;

      if (match.photo) {
        updates.set(player.id, match.photo);
        leaguepediaMatched += 1;
        remainingPlayers.delete(player.id);
        continue;
      }

      pendingPageTitles.add(match.candidate.id);
      pendingPlayers.push({ player, candidateId: match.candidate.id });
    }

    if (pendingPlayers.length > 0) {
      const pageImages = await resolveLeaguepediaPageImages(Array.from(pendingPageTitles), pageImageCache);
      const unresolvedPlayers = [];
      for (const pending of pendingPlayers) {
        const photo = pageImages[pending.candidateId];
        if (!photo) {
          unresolvedPlayers.push(pending);
          continue;
        }

        updates.set(pending.player.id, photo);
        leaguepediaPageImageMatched += 1;
        remainingPlayers.delete(pending.player.id);
      }

      if (unresolvedPlayers.length > 0) {
        const searchMatches = await resolveLeaguepediaSearchPageImages(
          unresolvedPlayers,
          pageImageCache,
          searchCache,
          parsedPageCache,
        );
        for (const pending of unresolvedPlayers) {
          const photo = searchMatches.get(pending.player.id);
          if (!photo) continue;

          updates.set(pending.player.id, photo);
          leaguepediaSearchMatched += 1;
          remainingPlayers.delete(pending.player.id);
        }
      }
    }

    if (remainingPlayers.size > 0) {
      const blindSearchMatches = await resolveLeaguepediaBlindSearchPageImages(
        Array.from(remainingPlayers.values()),
        candidatesByName,
        pageImageCache,
        searchCache,
        parsedPageCache,
      );

      for (const [playerId, photo] of blindSearchMatches.entries()) {
        if (!photo || !remainingPlayers.has(playerId)) continue;
        updates.set(playerId, photo);
        leaguepediaSearchMatched += 1;
        remainingPlayers.delete(playerId);
      }
    }
  }

  await applyUpdates(updates);

  const withPhoto = await prisma.player.count({
    where: { NOT: { photo: null } },
  });

  const missingPlayers = Array.from(remainingPlayers.values()).map((player) => ({
    id: player.id,
    name: player.name,
    role: player.role,
    team: player.team?.name,
    shortName: player.team?.shortName,
    region: player.team?.region,
  }));

  const summary = {
    totalPlayers,
    playersNeedingPhoto: playersNeedingPhoto.length,
    scoregg: scoreggStats,
    localCarryMatched,
    leaguepediaMatched,
    leaguepediaPageImageMatched,
    leaguepediaSearchMatched,
    updatedPlayers: updates.size,
    withPhoto,
    finalMissingCount: missingPlayers.length,
    finalMissingPreview: missingPlayers.slice(0, 200),
  };

  saveJsonFile(SUMMARY_OUTPUT_PATH, summary);
  saveJsonFile(MISSING_OUTPUT_PATH, missingPlayers);

  console.log('[fill-player-photos] complete');
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('[fill-player-photos] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
