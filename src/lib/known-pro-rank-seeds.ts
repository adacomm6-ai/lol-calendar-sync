export type KnownProRankSeedAccount = {
  platformLabel: string;
  platform: string;
  regionGroup: string;
  gameName: string;
  tagLine: string;
  sourceUrl?: string;
  note?: string;
};

export type KnownProRankSeed = {
  region: string;
  teamShortName: string;
  playerName: string;
  role: string;
  accounts: KnownProRankSeedAccount[];
};

function decodeSeedText(value: string) {
  return decodeURIComponent(value);
}

function normalizeText(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3\u4e00-\u9fa5#]+/g, '');
}

function normalizeRole(value: string) {
  const role = String(value || '').trim().toUpperCase();
  if (role === 'SUPPORT' || role === 'SUP') return 'SUP';
  if (role === 'JUNGLE' || role === 'JUN' || role === 'JUG') return 'JUN';
  if (role === 'BOTTOM' || role === 'BOT' || role === 'ADC') return 'ADC';
  if (role === 'MIDDLE' || role === 'MID') return 'MID';
  if (role === 'TOP') return 'TOP';
  return role || 'OTHER';
}

function buildSeedKey(input: { region: string; teamShortName: string; playerName: string; role: string }) {
  return [
    String(input.region || '').trim().toUpperCase(),
    String(input.teamShortName || '').trim().toUpperCase(),
    normalizeText(input.playerName),
    normalizeRole(input.role),
  ].join('::');
}

function buildLooseSeedKey(input: { region: string; playerName: string; role: string }) {
  return [
    String(input.region || '').trim().toUpperCase(),
    normalizeText(input.playerName),
    normalizeRole(input.role),
  ].join('::');
}

function buildUltraLooseSeedKey(input: { region: string; playerName: string }) {
  return [String(input.region || '').trim().toUpperCase(), normalizeText(input.playerName)].join('::');
}

export const KNOWN_PRO_RANK_SEEDS: KnownProRankSeed[] = [
  {
    region: 'LCK',
    teamShortName: 'GEN',
    playerName: 'Duro',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Duro',
        tagLine: 'Gen',
        sourceUrl: 'https://dpm.lol/pro/Duro',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'DK',
    playerName: 'Lucid',
    role: 'JUN',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'DK Lucid',
        tagLine: 'KR1',
        sourceUrl: 'https://dpm.lol/pro/Lucid',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'KT',
    playerName: 'Pollu',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'YdBB',
        tagLine: '0107',
        sourceUrl: 'https://dpm.lol/pro/Pollu',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'GEN',
    playerName: 'Kiin',
    role: 'TOP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'kiin',
        tagLine: 'KR1',
        sourceUrl: 'https://dpm.lol/pro/Kiin',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'GEN',
    playerName: 'Peyz',
    role: 'ADC',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Peyz',
        tagLine: 'KR11',
        sourceUrl: 'https://dpm.lol/pro/Peyz',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'GEN',
    playerName: 'Canyon',
    role: 'JUN',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'JUGKlNG',
        tagLine: 'kr',
        sourceUrl: 'https://dpm.lol/pro/Canyon',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'BFX',
    playerName: 'Kellin',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('%EB%8C%95%EC%B2%AD%EC%9E%87'),
        tagLine: 'KR123',
        sourceUrl: 'https://op.gg/lol/summoners/kr/%EB%8C%95%EC%B2%AD%EC%9E%87-KR123',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'KT',
    playerName: 'Bdd',
    role: 'MID',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('%EC%95%84%EA%B5%AC%EB%AA%AC'),
        tagLine: '0509',
        sourceUrl: 'https://op.gg/lol/summoners/kr/%EC%95%84%EA%B5%AC%EB%AA%AC-0509',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'BRO',
    playerName: 'Teddy',
    role: 'ADC',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Teddy',
        tagLine: 'sss',
        sourceUrl: 'https://dpm.lol/pro/Teddy',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'KT',
    playerName: 'Ghost',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Ghost',
        tagLine: decodeSeedText('%EC%98%AC%EB%9D%BC%EA%B0%91%EB%8B%88%EB%8B%A4'),
        sourceUrl: 'https://op.gg/lol/summoners/kr/Ghost-%EC%98%AC%EB%9D%BC%EA%B0%91%EB%8B%88%EB%8B%A4',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'DNS',
    playerName: 'Clozer',
    role: 'MID',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'DNF Clozer',
        tagLine: '0727',
        sourceUrl: 'https://dpm.lol/DNF%20Clozer-0727/lens',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'DK',
    playerName: 'ShowMaker',
    role: 'MID',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'MIDKING',
        tagLine: 'asd',
        sourceUrl: 'https://dpm.lol/pro/ShowMaker',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'DK',
    playerName: 'Career',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('%EA%BC%AC%EB%B6%80%EA%B8%B0'),
        tagLine: '0829',
        sourceUrl: 'https://op.gg/lol/summoners/kr/%EA%BC%AC%EB%B6%80%EA%B8%B0-0829',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'NS',
    playerName: 'Lehends',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Lehends',
        tagLine: 'KR1',
        sourceUrl: 'https://dpm.lol/pro/Lehends',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'NS',
    playerName: 'Scout',
    role: 'MID',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('%EB%AF%B8%EB%B6%81%EC%9D%B4'),
        tagLine: 'KR1',
        sourceUrl: 'https://dpm.lol/%EB%AF%B8%EB%B6%81%EC%9D%B4-KR1?page=58',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'KRX',
    playerName: 'Jiwoo',
    role: 'ADC',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'DRX Jiwoo',
        tagLine: '123',
        sourceUrl: 'https://dpm.lol/DRX%20Jiwoo-123',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'KRX',
    playerName: 'Ucal',
    role: 'MID',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '\uC6B0\uAC08\uC774',
        tagLine: '0130',
        sourceUrl: 'https://www.leagueofgraphs.com/overwolf/summoner/kr/%EC%9A%B0%EA%B0%88%EC%9D%B4-0130',
        note: 'TrackingThePros / LeagueOfGraphs public account mapping for Ucal',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'BFX',
    playerName: 'Vicla',
    role: 'MID',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('%EB%8C%80%EA%B4%91'),
        tagLine: 'God',
        sourceUrl: 'https://dpm.lol/pro/VicLa',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'DNS',
    playerName: 'Peter',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'high hopes',
        tagLine: 'DNS',
        sourceUrl: 'https://dpm.lol/high%20hopes-DNS/champions',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'BRO',
    playerName: 'Casting',
    role: 'TOP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Casting',
        tagLine: 'KR11',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'BRO',
    playerName: 'GIDEON',
    role: 'JUN',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Dawn u',
        tagLine: 'KR3',
        sourceUrl: 'https://dpm.lol/pro/GIDEON',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'BRO',
    playerName: 'Namgung',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('%EB%82%9C%EB%B0%A9%EA%B3%A0%EC%96%91%EC%9D%B4'),
        tagLine: '1103',
        sourceUrl: 'https://dpm.lol/pro/Namgung',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'BRO',
    playerName: 'Taeyoon',
    role: 'ADC',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('%ED%83%9C%20%EC%9C%A4'),
        tagLine: 'N S',
        sourceUrl: 'https://dpm.lol/pro/Taeyoon',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'DK',
    playerName: 'Siwoo',
    role: 'TOP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'TOPKING',
        tagLine: 'asd',
        sourceUrl: 'https://dpm.lol/pro/Siwoo',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'DK',
    playerName: 'Smash',
    role: 'ADC',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'DK Smash',
        tagLine: 'KR7',
        sourceUrl: 'https://dpm.lol/pro/Smash',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'DNS',
    playerName: 'deokdam',
    role: 'ADC',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'New York',
        tagLine: 'dream',
        sourceUrl: 'https://dpm.lol/pro/deokdam',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'DNS',
    playerName: 'DuDu',
    role: 'TOP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'KDF DuDu',
        tagLine: 'KING1',
        sourceUrl: 'https://dpm.lol/pro/Shelfmade',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'DNS',
    playerName: 'Pyosik',
    role: 'JUN',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'DNS Pyosik',
        tagLine: 'KR2',
        sourceUrl: 'https://dpm.lol/pro/Pyosik',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'KRX',
    playerName: 'Andil',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('%ED%8F%AC%EC%BC%93%EB%AA%AC%EB%A7%88%EC%8A%A4%ED%84%B0%EC%A7%80%EC%9A%B0'),
        tagLine: decodeSeedText('%EC%82%90%EC%B9%B4%EC%B8%84'),
        sourceUrl: 'https://dpm.lol/pro/Andil',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'KRX',
    playerName: 'Willer',
    role: 'JUN',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'DRX Willer',
        tagLine: 'DRX',
        sourceUrl: 'https://dpm.lol/pro/Willer',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'BFX',
    playerName: 'Diable',
    role: 'ADC',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'LSB Diable',
        tagLine: 'KR1',
        sourceUrl: 'https://dpm.lol/pro/Diable',
      },
    ],
  },
  {
    region: 'LCK',
    teamShortName: 'NS',
    playerName: 'Kingen',
    role: 'TOP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Kingen',
        tagLine: 'KR1',
        sourceUrl: 'https://dpm.lol/pro/Kingen',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'JDG',
    playerName: 'GALA',
    role: 'ADC',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'JDG GALA',
        tagLine: '123',
        sourceUrl: 'https://dpm.lol/pro/GALA',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'AL',
    playerName: 'Shanks',
    role: 'MID',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'xiangshen1',
        tagLine: 'KR1',
        sourceUrl: 'https://dpm.lol/pro/Shanks',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'AL',
    playerName: 'Flandre',
    role: 'TOP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'aierlanlaozhu',
        tagLine: 'KR1',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'TES',
    playerName: 'Creme',
    role: 'MID',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'livinli',
        tagLine: 'KR1',
        sourceUrl: 'https://dpm.lol/pro/Creme',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'LNG',
    playerName: 'Croco',
    role: 'JUN',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'CHAMA',
        tagLine: 'KR87',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'JDG',
    playerName: 'Xiaoxu',
    role: 'TOP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('%EC%83%A4%EC%98%A4%20%EC%91%A4A'),
        tagLine: 'KR1',
        sourceUrl: 'https://dpm.lol/pro/Xiaoxu',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'LNG',
    playerName: 'MISSING',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'mtrngrxsyl',
        tagLine: '6146',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'WBG',
    playerName: 'Zika',
    role: 'TOP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'yyyyyyyyyyyys',
        tagLine: '777',
        sourceUrl: 'https://dpm.lol/pro/Zika',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'WBG',
    playerName: 'Jiejie',
    role: 'JUN',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'jin zhi tao wa',
        tagLine: 'KR1',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'EDG',
    playerName: 'Xiaohao',
    role: 'JUN',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'xiaohao',
        tagLine: 'KR1',
        sourceUrl: 'https://op.gg/lol/summoners/kr/xiaohao-KR1',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'EDG',
    playerName: 'Zdz',
    role: 'TOP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Zdz',
        tagLine: '1203',
        sourceUrl: 'https://op.gg/lol/summoners/kr/Zdz-1203',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'JDG',
    playerName: 'Junjia',
    role: 'JUN',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'asdjipadsjip',
        tagLine: 'KR1',
        sourceUrl: 'https://dpm.lol/pro/JunJia',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'BLG',
    playerName: 'knight',
    role: 'MID',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('%EC%9D%B4%EC%84%BC%EC%8A%A4God'),
        tagLine: 'KR1',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'IG',
    playerName: 'Photic',
    role: 'ADC',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'qiqi77',
        tagLine: 'KR1',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'NIP',
    playerName: 'HOYA',
    role: 'TOP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('%EC%96%B4%EC%A9%8C%EB%9D%BC%EA%B3%A0%EB%A7%9E%EC%A7%B1%EB%9C%B0%EA%B9%8C'),
        tagLine: 'HOYA',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'LNG',
    playerName: 'Sheer',
    role: 'TOP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('%EC%8B%9C%EB%B9%84%EA%B1%B8%EB%A9%B4%EC%A7%80%EC%83%81%EB%A0%AC'),
        tagLine: 'KR1',
        sourceUrl: 'https://op.gg/lol/spectate/list/pro-gamer?region=kr',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'WBG',
    playerName: 'Elk',
    role: 'ADC',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'sad and bad',
        tagLine: 'KR1',
        sourceUrl: 'https://dpm.lol/pro/Elk',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'BLG',
    playerName: 'ON',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('BLG%20%EC%98%A8'),
        tagLine: 'KR1',
        sourceUrl: 'https://op.gg/ko/lol/summoners/kr/BLG%20%EC%98%A8-KR1',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'BLG',
    playerName: 'Viper',
    role: 'ADC',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Viper',
        tagLine: 'BLG',
        sourceUrl: 'https://op.gg/lol/summoners/kr/Viper-BLG',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'AL',
    playerName: 'Hope',
    role: 'ADC',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'jusaka',
        tagLine: 'rulo0',
        sourceUrl: 'https://dpm.lol/pro/Hope',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'WBG',
    playerName: 'Xiaohu',
    role: 'MID',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'WBG Xiaohu',
        tagLine: 'KR1',
        sourceUrl: 'https://op.gg/lol/summoners/kr/WBG%20Xiaohu-KR1/matches',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'IG',
    playerName: 'Wei',
    role: 'JUN',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Kimman',
        tagLine: 'zxfkk',
        sourceUrl: 'https://dpm.lol/pro/Wei',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'BLG',
    playerName: 'Xun',
    role: 'JUN',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('%EB%B0%B1%ED%99%94%EC%9A%94%EB%9E%91'),
        tagLine: 'KR1',
        sourceUrl: 'https://op.gg/lol/summoners/kr/%EB%B0%B1%ED%99%94%EC%9A%94%EB%9E%91-KR1',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'NIP',
    playerName: 'Assum',
    role: 'ADC',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'xycg',
        tagLine: 'KR1',
        sourceUrl: 'https://dpm.lol/pro/Assum',
      },
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'cuicuishu',
        tagLine: 'KR1',
        sourceUrl: 'https://dpm.lol/pro/Assum',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'WBG',
    playerName: 'Hery',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('%ED%97%A4%EB%A6%ACz'),
        tagLine: '6666',
        sourceUrl: 'https://www.trackingthepros.com/player/Hery',
        note: 'TrackingThePros verified account',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'NIP',
    playerName: 'erha',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '25hdp',
        tagLine: 'JDG',
        sourceUrl: 'https://www.op.gg/lol/summoners/kr/25hdp-JDG',
        note: 'OP.GG / Leaguepedia 公开页面确认',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'TES',
    playerName: 'fengyue',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: decodeSeedText('%E6%97%A5%E7%9B%8A%E6%BE%84%E6%98%8E'),
        tagLine: 'TES',
        sourceUrl: 'https://www.op.gg/lol/summoners/kr/%E6%97%A5%E7%9B%8A%E6%BE%84%E6%98%8E-TES',
        note: 'OP.GG / Leaguepedia 公开页面确认',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'TT',
    playerName: 'Heru',
    role: 'MID',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Heru',
        tagLine: 'KR821',
        sourceUrl: 'https://www.op.gg/lol/summoners/kr/Heru-KR821',
        note: 'OP.GG 公开页面确认',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'TT',
    playerName: 'Keshi',
    role: 'TOP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Keshi',
        tagLine: 'Lqh',
        sourceUrl: 'https://www.op.gg/lol/summoners/kr/Keshi-Lqh',
        note: 'OP.GG 公开页面确认',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'UP',
    playerName: 'Xiaoxia',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: 'Lovepanpan',
        tagLine: 'KR1',
        sourceUrl: 'https://www.op.gg/lol/summoners/kr/Lovepanpan-KR1',
        note: 'OP.GG 公开页面确认',
      },
    ],
  },
  {
    region: 'LPL',
    teamShortName: 'WE',
    playerName: 'yaoyao',
    role: 'SUP',
    accounts: [
      {
        platformLabel: 'KR',
        platform: 'KR',
        regionGroup: 'ASIA',
        gameName: '富冈义勇',
        tagLine: '水之呼吸',
        sourceUrl: 'https://dpm.lol/pro/yaoyao',
        note: 'DPM.LOL 公开职业页确认',
      },
    ],
  },
];

function buildSeedGroupMap<KeyInput>(
  builder: (seed: KnownProRankSeed) => string,
) {
  return KNOWN_PRO_RANK_SEEDS.reduce((map, seed) => {
    const key = builder(seed);
    const existing = map.get(key) || [];
    existing.push(seed);
    map.set(key, existing);
    return map;
  }, new Map<string, KnownProRankSeed[]>());
}

function dedupeKnownSeeds(seeds: KnownProRankSeed[]) {
  return Array.from(
    seeds.reduce((map, seed) => {
      map.set(
        buildSeedKey({
          region: seed.region,
          teamShortName: seed.teamShortName,
          playerName: seed.playerName,
          role: seed.role,
        }),
        seed,
      );
      return map;
    }, new Map<string, KnownProRankSeed>()),
  ).map(([, seed]) => seed);
}

const KNOWN_PRO_RANK_SEED_MAP = buildSeedGroupMap((seed) =>
  buildSeedKey({
    region: seed.region,
    teamShortName: seed.teamShortName,
    playerName: seed.playerName,
    role: seed.role,
  }),
);

const KNOWN_PRO_RANK_SEED_LOOSE_MAP = buildSeedGroupMap((seed) =>
  buildLooseSeedKey({
    region: seed.region,
    playerName: seed.playerName,
    role: seed.role,
  }),
);

const KNOWN_PRO_RANK_SEED_ULTRA_LOOSE_MAP = buildSeedGroupMap((seed) =>
  buildUltraLooseSeedKey({
    region: seed.region,
    playerName: seed.playerName,
  }),
);

export function findKnownProRankSeeds(input: {
  region: string;
  teamShortName: string;
  playerName: string;
  role: string;
}) {
  const normalizedRegion = String(input.region || '').trim().toUpperCase();
  const normalizedTeamShortName = String(input.teamShortName || '').trim().toUpperCase();
  const normalizedPlayerName = normalizeText(input.playerName);
  const normalizedRole = normalizeRole(input.role);

  return dedupeKnownSeeds([
    ...(KNOWN_PRO_RANK_SEED_MAP.get(
      buildSeedKey({
        region: input.region,
        teamShortName: input.teamShortName,
        playerName: input.playerName,
        role: input.role,
      }),
    ) || []),
    ...(KNOWN_PRO_RANK_SEED_LOOSE_MAP.get(
      buildLooseSeedKey({
        region: input.region,
        playerName: input.playerName,
        role: input.role,
      }),
    ) || []),
    ...(KNOWN_PRO_RANK_SEED_ULTRA_LOOSE_MAP.get(
      buildUltraLooseSeedKey({
        region: input.region,
        playerName: input.playerName,
      }),
    ) || []),
    ...KNOWN_PRO_RANK_SEEDS.filter((seed) => {
      if (String(seed.region || '').trim().toUpperCase() !== normalizedRegion) return false;
      if (normalizeText(seed.playerName) !== normalizedPlayerName) return false;

      const seedRole = normalizeRole(seed.role);
      const teamMatches = String(seed.teamShortName || '').trim().toUpperCase() === normalizedTeamShortName;
      const roleMatches = seedRole === normalizedRole;

      return (teamMatches && roleMatches) || roleMatches || teamMatches;
    }),
  ]);
}

export function findKnownProRankSeed(input: {
  region: string;
  teamShortName: string;
  playerName: string;
  role: string;
}) {
  return findKnownProRankSeeds(input)[0] || null;
}
