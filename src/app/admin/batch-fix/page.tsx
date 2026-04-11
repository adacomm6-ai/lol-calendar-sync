
import { prisma } from '@/lib/db';
import BatchFixClient from './BatchFixClient';

export const dynamic = 'force-dynamic'; // Prevent Static Build


export default async function BatchFixPage() {
    const players = await prisma.player.findMany({
        orderBy: { name: 'asc' },
        include: { team: true }
    });

    return (
        <main className="min-h-screen bg-slate-950 p-8">
            <BatchFixClient players={players} />
        </main>
    );
}
