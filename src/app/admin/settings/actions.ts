'use server';

import { getSystemConfig, saveSystemConfig, SystemConfigData } from '@/lib/config-service';
import { revalidatePath } from 'next/cache';

export async function fetchSettings() {
    return await getSystemConfig();
}

export async function updateSettings(config: SystemConfigData) {
    try {
        await saveSystemConfig(config);
        const latestConfig = await getSystemConfig();
        revalidatePath('/admin/settings');
        revalidatePath('/', 'layout');
        return { success: true, config: latestConfig };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
