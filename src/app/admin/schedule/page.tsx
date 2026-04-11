import { getTeamsInput, searchMatches, getTournaments } from './actions';
import ScheduleManagerClient from './ScheduleManagerClient';
import { getSystemConfig } from '@/lib/config-service';

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
    // Fetch initial data
    const [teamsRes, matchesRes, tournamentsRes] = await Promise.all([
        getTeamsInput(),
        searchMatches(), // Default search (upcoming)
        getTournaments(),
    ]);

    const teams = teamsRes.success && teamsRes.teams ? teamsRes.teams : [];
    const matches = matchesRes.success && matchesRes.matches ? matchesRes.matches : [];
    const tournaments = tournamentsRes.success && tournamentsRes.tournaments ? tournamentsRes.tournaments : [];

    const config = await getSystemConfig();
    const systemRegions = config.regions.map((r) => r.id);
    const stageOptions = config.matchStageOptions || [];
    const localOnly = true;

    return (
        <div className="w-full px-1 sm:px-2 lg:px-3">
            <h1 className="text-3xl font-bold mb-8 text-white mt-4">赛程管理后台</h1>

            <ScheduleManagerClient
                initialMatches={matches}
                teams={teams}
                existingTournaments={tournaments}
                systemRegions={systemRegions}
                stageOptions={stageOptions}
                localOnly={localOnly}
            />
        </div>
    );
}



