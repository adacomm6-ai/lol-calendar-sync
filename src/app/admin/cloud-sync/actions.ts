'use server';

interface SyncResult {
    table: string;
    cloudCount: number;
    localCount: number;
    synced: number;
    failed: number;
    error?: string;
}

interface PullResult {
    success: boolean;
    results: SyncResult[];
    error?: string;
    duration: number;
}

const DISABLED_MSG = '本地模式已禁用云同步功能';

export async function getLocalStats(): Promise<Record<string, number>> {
    return {
        Team: 0,
        Hero: 0,
        Player: 0,
        UserProfile: 0,
        Match: 0,
        Game: 0,
        Comment: 0,
        TeamComment: 0,
        Odds: 0,
    };
}

export async function pullFromCloud(): Promise<PullResult> {
    return {
        success: false,
        results: [],
        error: DISABLED_MSG,
        duration: 0,
    };
}
