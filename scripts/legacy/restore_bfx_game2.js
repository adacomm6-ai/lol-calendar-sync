const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const matchId = '638d79da-2721-4fd8-8d1a-81042f28a0b1'; // BFX vs NS
    const gameNumber = 2; // We only have data for Game 2

    const teamAStats = `[{\"name\":\"Clear\",\"damage\":27800,\"kills\":19,\"deaths\":11,\"assists\":33,\"team\":\"Blue\",\"role\":\"TOP\",\"hero\":\"Kennen\",\"hero_alias\":\"狂暴之心\",\"hero_avatar\":\"https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/Kennen.png\"},{\"name\":\"Raptor\",\"damage\":23300,\"kills\":19,\"deaths\":11,\"assists\":33,\"team\":\"Blue\",\"role\":\"JUNGLE\",\"hero\":\"Pantheon\",\"hero_alias\":\"不屈之枪\",\"hero_avatar\":\"https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/Pantheon.png\"},{\"name\":\"VicLa\",\"damage\":28400,\"kills\":19,\"deaths\":11,\"assists\":33,\"team\":\"Blue\",\"role\":\"MID\",\"hero\":\"Sylas\",\"hero_alias\":\"解脱者\",\"hero_avatar\":\"https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/Sylas.png\"},{\"name\":\"Diable\",\"damage\":23100,\"kills\":19,\"deaths\":11,\"assists\":33,\"team\":\"Blue\",\"role\":\"ADC\",\"hero\":\"Ezreal\",\"hero_alias\":\"探险家\",\"hero_avatar\":\"https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/Ezreal.png\"},{\"name\":\"Kellin\",\"damage\":10400,\"kills\":19,\"deaths\":11,\"assists\":33,\"team\":\"Blue\",\"role\":\"SUPPORT\",\"hero\":\"Neeko\",\"hero_alias\":\"万花通灵\",\"hero_avatar\":\"https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/Neeko.png\"}]`;

    const teamBStats = `[{\"name\":\"Kingen\",\"damage\":13300,\"kills\":11,\"deaths\":19,\"assists\":20,\"team\":\"Red\",\"role\":\"TOP\",\"hero\":\"Renekton\",\"hero_alias\":\"荒漠屠夫\",\"hero_avatar\":\"https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/Renekton.png\"},{\"name\":\"Sponge\",\"damage\":14500,\"kills\":11,\"deaths\":19,\"assists\":20,\"team\":\"Red\",\"role\":\"JUNGLE\",\"hero\":\"MonkeyKing\",\"hero_alias\":\"齐天大圣\",\"hero_avatar\":\"https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/MonkeyKing.png\"},{\"name\":\"Scout\",\"damage\":19400,\"kills\":11,\"deaths\":19,\"assists\":20,\"team\":\"Red\",\"role\":\"MID\",\"hero\":\"Orianna\",\"hero_alias\":\"发条魔灵\",\"hero_avatar\":\"https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/Orianna.png\"},{\"name\":\"Taeyoon\",\"damage\":18800,\"kills\":11,\"deaths\":19,\"assists\":20,\"team\":\"Red\",\"role\":\"ADC\",\"hero\":\"Varus\",\"hero_alias\":\"惩戒之箭\",\"hero_avatar\":\"https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/Varus.png\"},{\"name\":\"Lehends\",\"damage\":3300,\"kills\":11,\"deaths\":19,\"assists\":20,\"team\":\"Red\",\"role\":\"SUPPORT\",\"hero\":\"Alistar\",\"hero_alias\":\"牛头酋长\",\"hero_avatar\":\"https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/Alistar.png\"}]`;

    const analysisData = `{\"winner\":\"Blue\",\"duration\":\"28:47\",\"damage_data\":${teamAStats},\"blue_kills\":19,\"blue_team_name\":\"BFX\",\"gold_chart_bbox\":[660,518,900,940],\"red_kills\":11,\"red_team_name\":\"NS\",\"total_kills\":30,\"gold_curve_path\":\"/uploads/gold_curves/gold_curve_7e48db11ad852d02.png\",\"match\":\"Gemini Vision Parsed (Node.js)\",\"raw_text\":\"Analyzed by Gemini 2.0 Flash (Node.js)\",\"original_image_url\":\"/uploads/analysis_1768477683935_631.png\"}`;

    await prisma.game.updateMany({
        where: { matchId: matchId, gameNumber: gameNumber },
        data: {
            duration: 1727,
            totalKills: 30,
            blueKills: 19,
            redKills: 11,
            blueTenMinKills: 4,
            redTenMinKills: 1,
            teamAStats,
            teamBStats,
            blueSideTeamId: 'c1cac45a-2a71-4090-8083-2126878d82f9',
            redSideTeamId: 'e1d76c08-47ce-43e2-a32c-936d2ac99c7b',
            screenshot: '/uploads/analysis_1768477683935_631.png',
            analysisData
        }
    });

    console.log('Restored Game 2 Data for BFX vs NS');
}

main();
