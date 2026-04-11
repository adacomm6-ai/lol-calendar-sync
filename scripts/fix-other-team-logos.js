const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const TEAM_LOGO_FIXES = [
  {
    label: '9Gaming Esports',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/e/ea/9Gaminglogo_std.png/revision/latest?cb=20251223124432',
    names: ['9Gaming Esports'],
    shortNames: ['9E'],
  },
  {
    label: 'Arneb',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/0/08/Arneblogo_std.png/revision/latest?cb=20251209021432',
    names: ['Arneb'],
    shortNames: ['ARNEB'],
  },
  {
    label: 'Bamboo Juice',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/5/5e/Bamboo_Juicelogo_std.png/revision/latest?cb=20260128174925',
    names: ['Bamboo Juice'],
    shortNames: ['BJ'],
  },
  {
    label: 'CAG OSAKA',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/5/56/CAG_OSAKAlogo_std.png/revision/latest?cb=20260129102116',
    names: ['CAG OSAKA'],
    shortNames: ['CO'],
  },
  {
    label: 'Clocks',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/3/37/Clockslogo_std.png/revision/latest?cb=20260223082455',
    names: ['Clocks'],
    shortNames: ['CLOCKS'],
  },
  {
    label: 'DetonatioN FocusMe Academy',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/c/ce/DetonatioN_FocusMelogo_std.png/revision/latest?cb=20251225045911',
    names: ['DetonatioN FocusMe Academy'],
    shortNames: ['DFA'],
  },
  {
    label: 'Fast8',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/4/4e/Fast8logo_std.png/revision/latest?cb=20260217111059',
    names: ['Fast8'],
    shortNames: ['FAST8'],
  },
  {
    label: 'FENNEL',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/6/62/FENNELlogo_std.png/revision/latest?cb=20220907170609',
    names: ['FENNEL'],
    shortNames: ['FENNEL'],
  },
  {
    label: 'Inferno Drive Tokyo',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/a/a7/Inferno_Drive_Tokyologo_std.png/revision/latest?cb=20260223080726',
    names: ['Inferno Drive Tokyo'],
    shortNames: ['IDT'],
  },
  {
    label: 'L Guide Gaming',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/8/82/L_Guide_Gaminglogo_std.png/revision/latest?cb=20251223213821',
    names: ['L Guide Gaming'],
    shortNames: ['LGG'],
  },
  {
    label: 'MVK Esports Academy',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/0/0e/MVK_Esportslogo_std.png/revision/latest?cb=20260114112404',
    names: ['MVK Esports Academy'],
    shortNames: ['MEA'],
  },
  {
    label: 'New Meta',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/e/e7/New_Metalogo_std.png/revision/latest?cb=20260127150420',
    names: ['New Meta'],
    shortNames: ['NM'],
  },
  {
    label: 'Ngua Hi Esports',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/5/5d/Ng%E1%BB%B1a_H%C3%AD_Esportslogo_std.png/revision/latest?cb=20260221033202',
    names: ['Ngựa Hí Esports'],
    shortNames: ['NHE'],
  },
  {
    label: 'NOVEX',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/5/52/NOVEXlogo_std.png/revision/latest?cb=20260223074857',
    names: ['NOVEX'],
    shortNames: ['NOVEX'],
  },
  {
    label: 'Rising Gaming',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/2/28/Rising_Gaminglogo_std.png/revision/latest?cb=20260217115204',
    names: ['Rising Gaming'],
    shortNames: ['RG'],
  },
  {
    label: 'Revolution Victory X',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/9/9b/Revolution_Victory_Xlogo_std.png/revision/latest?cb=20260128161310',
    names: ['Revolution Victory X'],
    shortNames: ['RVX'],
  },
  {
    label: 'SN CyberCore Esports',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/a/ae/CyberCore_Esportslogo_std.png/revision/latest?cb=20250218061916',
    names: ['SN CyberCore Esports'],
    shortNames: ['SCE'],
  },
  {
    label: 'Saigon Dino',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/4/48/Saigon_Dinologo_std.png/revision/latest?cb=20250108072410',
    names: ['Saigon Dino'],
    shortNames: ['SD'],
  },
  {
    label: 'Saigon Warriors',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/b/b9/Saigon_Warriorslogo_std.png/revision/latest?cb=20260221042151',
    names: ['Saigon Warriors'],
    shortNames: ['SW'],
  },
  {
    label: 'Uwinks',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/73/Uwinkslogo_std.png/revision/latest?cb=20260217110617',
    names: ['Uwinks'],
    shortNames: ['UWINKS'],
  },
  {
    label: 'UEC eSports PlusPlus',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/72/UEC_eSports_PlusPluslogo_std.png/revision/latest?cb=20260128160521',
    names: ['UEC eSports PlusPlus'],
    shortNames: ['UEP'],
  },
  {
    label: 'VARREL YOUTH',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/4/4b/VARREL_YOUTHlogo_std.png/revision/latest?cb=20250116115511',
    names: ['VARREL YOUTH'],
    shortNames: ['VY'],
  },
  {
    label: 'VelbeliKaizokudan',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/4/49/VelbeliKaizokudanlogo_std.png/revision/latest?cb=20250228111005',
    names: ['VelbeliKaizokudan'],
    shortNames: [],
  },
  {
    label: 'V3 Esports',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/9/9d/V3_Esportslogo_std.png/revision/latest?cb=20210808030826',
    names: ['V3 Esports'],
    shortNames: ['VE'],
  },
  {
    label: 'Yang Yang Gaming',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/0/0e/Yang_Yang_Gaminglogo_std.png/revision/latest?cb=20260128150513',
    names: ['Yang Yang Gaming'],
    shortNames: ['YYG'],
  },
  {
    label: 'Cloud9',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/0/09/Cloud9logo_std.png/revision/latest?cb=20230426052612',
    names: ['Cloud9', 'C9'],
    shortNames: ['C9'],
  },
  {
    label: 'CTBC Flying Oyster',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/1/15/CTBC_Flying_Oysterlogo_std.png/revision/latest?cb=20221014190546',
    names: ['CFO', 'CTBC Flying Oyster'],
    shortNames: ['CFO'],
  },
  {
    label: 'Deep Cross Gaming',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/4/4a/Deep_Cross_Gaminglogo_std.png/revision/latest?cb=20260121184520',
    names: ['DCG', 'Deep Cross Gaming'],
    shortNames: ['DCG'],
  },
  {
    label: 'DetonatioN FocusMe',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/c/ce/DetonatioN_FocusMelogo_std.png/revision/latest?cb=20251225045911',
    names: ['DFM', 'DetonatioN FocusMe'],
    shortNames: ['DFM'],
  },
  {
    label: 'Dignitas',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/f/fb/Dignitaslogo_std.png/revision/latest?cb=20230323083120',
    names: ['DIG', 'Dignitas'],
    shortNames: ['DIG'],
  },
  {
    label: 'Disguised',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/d/d1/Disguisedlogo_std.png/revision/latest?cb=20231215200540',
    names: ['Disguised', 'DSG'],
    shortNames: ['DSG'],
  },
  {
    label: 'FlyQuest',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/7d/FlyQuestlogo_std.png/revision/latest?cb=20260110234106',
    names: ['FLY', 'FlyQuest'],
    shortNames: ['FLY'],
  },
  {
    label: 'Fnatic',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/4/48/Fnaticlogo_std.png/revision/latest?cb=20200124162848',
    names: ['FNC', 'Fnatic'],
    shortNames: ['FNC'],
  },
  {
    label: 'FURIA',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/a/a0/FURIAlogo_std.png/revision/latest?cb=20200121190808',
    names: ['FUR', 'FURIA'],
    shortNames: ['FUR', 'FURIA'],
  },
  {
    label: 'Fluxo W7M',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/6/61/Fluxo_W7Mlogo_std.png/revision/latest?cb=20260105211549',
    names: ['FX7M', 'Fluxo W7M'],
    shortNames: ['FX7M'],
  },
  {
    label: 'G2 Esports',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/5/50/G2_Esportslogo_std.png/revision/latest?cb=20230426141941',
    names: ['G2', 'G2 Esports'],
    shortNames: ['G2'],
  },
  {
    label: 'GAM Esports',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/6/64/MESlogo_std.png/revision/latest?cb=20210607033239',
    names: ['GAM', 'GAM Esports'],
    shortNames: ['GAM'],
  },
  {
    label: 'GIANTX',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/3/34/GIANTXlogo_std.png/revision/latest?cb=20231214160223',
    names: ['GX', 'GIANTX'],
    shortNames: ['GX'],
  },
  {
    label: 'Ground Zero Gaming',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/0/05/Ground_Zero_Gaminglogo_std.png/revision/latest?cb=20260128083556',
    names: ['GZ', 'Ground Zero Gaming'],
    shortNames: ['GZ', 'GZG'],
  },
  {
    label: 'Karmine Corp',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/e/ed/Karmine_Corplogo_std.png/revision/latest?cb=20240319113946',
    names: ['KC', 'Karmine Corp'],
    shortNames: ['KC'],
  },
  {
    label: 'Karmine Corp Blue',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/9/9f/Karmine_Corp_Bluelogo_profile.png/revision/latest?cb=20260110071859',
    names: ['KCB', 'Karmine Corp Blue'],
    shortNames: ['KCB'],
  },
  {
    label: 'Leviatan',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/0/09/Leviatanlogo_std.png/revision/latest?cb=20230406020301',
    names: ['LEV', 'Leviatan'],
    shortNames: ['LEV'],
  },
  {
    label: 'Ilha das Lendas',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/6/67/Ilha_das_Lendaslogo_std.png/revision/latest?cb=20240112223454',
    names: ['LLL', 'Ilha das Lendas'],
    shortNames: ['LLL'],
  },
  {
    label: 'LOS',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/3/3c/L%C3%98Slogo_std.png/revision/latest?cb=20230608222225',
    names: ['LOS', 'LØS'],
    shortNames: ['LOS', 'LØS'],
  },
  {
    label: 'LOUD',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/b/ba/LOUDlogo_std.png/revision/latest?cb=20260105230531',
    names: ['LOUD'],
    shortNames: ['LOUD'],
  },
  {
    label: 'Los Ratones',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/6/6d/Los_Ratoneslogo_std.png/revision/latest?cb=20250122225954',
    names: ['LR', 'Los Ratones'],
    shortNames: ['LR'],
  },
  {
    label: 'LYON',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/7/78/LYON_%282024_American_Team%29logo_std.png/revision/latest?cb=20250109184845',
    names: ['LYON', 'Lyon'],
    shortNames: ['LYON'],
  },
  {
    label: 'Movistar KOI',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/b/bf/Movistar_KOIlogo_std.png/revision/latest?cb=20240528162757',
    names: ['MKOI', 'Movistar KOI', 'MVKE', 'Movistar KOI Fenix', 'Movistar KOI Fénix'],
    shortNames: ['MKOI', 'MVKE'],
  },
  {
    label: 'Natus Vincere',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/1/16/Natus_Vincerelogo_std.png/revision/latest?cb=20250519222647',
    names: ['NAVI', 'NV', 'Natus Vincere'],
    shortNames: ['NAVI', 'NV'],
  },
  {
    label: 'PaiN Gaming',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/a/a1/Painlogo_std.png/revision/latest?cb=20210521134807',
    names: ['PNG', 'PaiN Gaming'],
    shortNames: ['PNG'],
  },
  {
    label: 'RED Canids',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/3/30/RED_Canidslogo_std.png/revision/latest?cb=20230426043334',
    names: ['RED', 'RED Canids'],
    shortNames: ['RED', 'RC'],
  },
  {
    label: 'Sentinels',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/a/a5/Sentinelslogo_std.png/revision/latest?cb=20251229071752',
    names: ['SEN', 'Sentinels'],
    shortNames: ['SEN'],
  },
  {
    label: 'Shifters',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/4/43/Shifterslogo_std.png/revision/latest?cb=20251221232555',
    names: ['Shifters', 'SHFT'],
    shortNames: ['SHFT'],
  },
  {
    label: 'Fukuoka SoftBank HAWKS gaming',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/6/65/Fukuoka_SoftBank_HAWKS_gaminglogo_std.png/revision/latest?cb=20251225090647',
    names: ['SHG', 'Fukuoka SoftBank HAWKS gaming'],
    shortNames: ['SHG'],
  },
  {
    label: 'SK Gaming',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/e/e3/SK_Gaminglogo_std.png/revision/latest?cb=20221129151514',
    names: ['SK', 'SK Gaming'],
    shortNames: ['SK'],
  },
  {
    label: 'Shopify Rebellion',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/1/17/Shopify_Rebellionlogo_std.png/revision/latest?cb=20251229054431',
    names: ['SR', 'Shopify Rebellion'],
    shortNames: ['SR'],
  },
  {
    label: 'Team Heretics',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/c/c0/Team_Hereticslogo_std.png/revision/latest?cb=20251230025340',
    names: ['TH', 'Team Heretics'],
    shortNames: ['TH'],
  },
  {
    label: 'Team Liquid',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/b/bf/Team_Liquidlogo_std.png/revision/latest?cb=20251229064312',
    names: ['TL', 'Team Liquid'],
    shortNames: ['TL'],
  },
  {
    label: 'Team Secret Whales',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/a/ab/Team_Secret_Whaleslogo_std.png/revision/latest?cb=20251225073633',
    names: ['TSW', 'Team Secret Whales'],
    shortNames: ['TSW'],
  },
  {
    label: 'Team Vitality',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/6/63/Team_Vitalitylogo_std.png/revision/latest?cb=20230224185634',
    names: ['VIT', 'Team Vitality'],
    shortNames: ['VIT'],
  },
  {
    label: 'Vivo Keyd Stars',
    logo: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/d/d3/Vivo_Keyd_Starslogo_std.png/revision/latest?cb=20221116002741',
    names: ['VKS', 'Vivo Keyd Stars'],
    shortNames: ['VKS'],
  },
];

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function main() {
  const summary = [];

  for (const item of TEAM_LOGO_FIXES) {
    const names = unique(item.names || []);
    const shortNames = unique(item.shortNames || []);

    const result = await prisma.team.updateMany({
      where: {
        region: { contains: 'OTHER' },
        OR: [
          ...(names.length ? [{ name: { in: names } }] : []),
          ...(shortNames.length ? [{ shortName: { in: shortNames } }] : []),
        ],
      },
      data: {
        logo: item.logo,
      },
    });

    summary.push({
      label: item.label,
      count: result.count,
      logo: item.logo,
    });
  }

  const activeTeams = await prisma.match.findMany({
    where: { status: 'FINISHED' },
    select: {
      startTime: true,
      teamA: { select: { id: true, name: true, shortName: true, region: true, logo: true } },
      teamB: { select: { id: true, name: true, shortName: true, region: true, logo: true } },
    },
  });

  const start = new Date('2025-11-01T00:00:00.000Z');
  const end = new Date('2027-01-01T00:00:00.000Z');
  const stillMissing = new Map();

  for (const match of activeTeams) {
    const time = match.startTime ? new Date(match.startTime) : null;
    if (!time || Number.isNaN(time.getTime()) || time < start || time >= end) continue;

    for (const team of [match.teamA, match.teamB]) {
      if (!team || String(team.region || '').toUpperCase() !== 'OTHER') continue;
      if (team.logo) continue;
      stillMissing.set(team.id, {
        id: team.id,
        name: team.name,
        shortName: team.shortName,
      });
    }
  }

  console.log(JSON.stringify({ summary, stillMissing: Array.from(stillMissing.values()) }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
