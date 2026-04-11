import { Suspense } from 'react';
import { prisma } from '@/lib/db';
import { getSystemConfig } from '@/lib/config-service';
import AdminDashboardClient from './AdminDashboardClient';

export const dynamic = 'force-dynamic';

type AdminSettingsPageProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminSettingsPage({ searchParams }: AdminSettingsPageProps) {
    const resolvedSearchParams = (await searchParams) ?? {};
    const requestedTab = Array.isArray(resolvedSearchParams.tab)
        ? resolvedSearchParams.tab[0]
        : resolvedSearchParams.tab;
    const [config, teams] = await Promise.all([
        getSystemConfig(),
        prisma.team.findMany({
            orderBy: { name: 'asc' },
            select: { id: true, name: true, shortName: true, region: true, logo: true },
        }),
    ]);

    const regions = config.regions.map((r) => r.id);

    return (
        <div className="animate-in fade-in duration-500">
            <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading Dashboard...</div>}>
                <AdminDashboardClient
                    initialConfig={config}
                    initialTeams={teams}
                    regions={regions}
                    initialTab={requestedTab}
                />
            </Suspense>
        </div>
    );
}
