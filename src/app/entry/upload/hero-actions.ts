
'use server';

import { prisma } from '@/lib/db';

export async function getHeroes() {
    try {
        const heroes = await prisma.hero.findMany({
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                alias: true,
                title: true,
                avatarUrl: true
            }
        });
        return { success: true, heroes };
    } catch (e) {
        console.error(e);
        return { success: false, heroes: [] };
    }
}
