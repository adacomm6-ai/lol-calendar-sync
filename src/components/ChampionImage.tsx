'use client';

import { useEffect, useMemo, useState } from 'react';

interface ChampionImageProps {
    name: string;
    className?: string;
    fallbackContent?: React.ReactNode;
}

function normalizeChampionId(input: string): string {
    let cleanName = String(input || '').replace(/[^a-zA-Z0-9]/g, '');

    const aliases: Record<string, string> = {
        Wukong: 'MonkeyKing',
        Renata: 'Renata',
        RenataGlasc: 'Renata',
        Nunu: 'Nunu',
        NunuWillump: 'Nunu',
        NunuAndWillump: 'Nunu',
        JarvanIV: 'JarvanIV',
        MissFortune: 'MissFortune',
        TahmKench: 'TahmKench',
        KaiSa: 'Kaisa',
        Kaisa: 'Kaisa',
        KogMaw: 'KogMaw',
        LeeSin: 'LeeSin',
        MasterYi: 'MasterYi',
        XinZhao: 'XinZhao',
        DrMundo: 'DrMundo',
        TwistedFate: 'TwistedFate',
        AurelionSol: 'AurelionSol',
        BelVeth: 'Belveth',
        ChoGath: 'Chogath',
        KhaZix: 'Khazix',
        Leblanc: 'Leblanc',
        LeBlanc: 'Leblanc',
        RekSai: 'RekSai',
        KSante: 'KSante',
        Scoregg695: 'Mel',
        Scoregg705: 'Yunara',
        Scoregg711: 'Zaahen',
    };

    if (aliases[cleanName]) cleanName = aliases[cleanName];
    return cleanName;
}

export default function ChampionImage({ name, className, fallbackContent }: ChampionImageProps) {
    const [sourceIndex, setSourceIndex] = useState(0);
    const [hasError, setHasError] = useState(false);

    const sources = useMemo(() => {
        const championId = normalizeChampionId(name);
        if (!championId) return [] as string[];

        return [
            `/images/champions/${championId}.png`,
            `https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/${championId}.png`,
            `https://ddragon.leagueoflegends.com/cdn/15.6.1/img/champion/${championId}.png`,
        ];
    }, [name]);

    useEffect(() => {
        setSourceIndex(0);
        setHasError(false);
    }, [name]);

    if (hasError || sources.length === 0) {
        return <>{fallbackContent}</>;
    }

    return (
        <div className={`relative ${className || ''}`}>
            <img
                src={sources[sourceIndex]}
                alt={name}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                draggable={false}
                onError={() => {
                    if (sourceIndex < sources.length - 1) {
                        setSourceIndex((prev) => prev + 1);
                        return;
                    }
                    setHasError(true);
                }}
            />
        </div>
    );
}



