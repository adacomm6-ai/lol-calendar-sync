
const toLocal = (url, heroName) => {
    // Validation
    if (!url && !heroName) return '/images/champions/unknown.png';

    let filename = '';
    if (url && (url.includes('ddragon') || url.includes('http') || url.includes('/'))) {
        const parts = url.split('/');
        filename = parts[parts.length - 1];
    } else if (heroName) {
        filename = heroName;
    } else {
        filename = url;
    }

    // Clean extension
    let name = filename.replace(/\.png|\.webp|\.jpg/gi, '');

    // FIX: Remove ALL non-alphanumeric chars (spaces, dots, apostrophes)
    name = name.replace(/[^a-zA-Z0-9]/g, '');

    return `/images/champions/${name}.png`;
};

const examples = [
    { url: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/DrMundo.png', hero: 'Dr. Mundo' },
    { url: '', hero: 'Dr. Mundo' },
    { url: '', hero: "Kai'Sa" },
    { url: '', hero: "Jarvan IV" },
    { url: '', hero: "Lee Sin" },
    { url: '', hero: "Wukong" },
    { url: 'SomeUrl/MissFortune.png', hero: 'Miss Fortune' },
];

examples.forEach(ex => {
    console.log(`Input: URL="${ex.url}", Hero="${ex.hero}" => Output: ${toLocal(ex.url, ex.hero)}`);
});
