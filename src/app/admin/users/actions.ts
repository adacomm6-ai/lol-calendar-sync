'use server';

export type UserView = {
    id: string;
    email: string | undefined;
    name: string;
    role: string;
    lastSignIn: string | null;
    createdAt: string;
};

const DISABLED_MSG = '本地模式已禁用用户系统功能';

export async function getAllUsers(): Promise<{ users?: UserView[]; error?: string }> {
    return { users: [], error: DISABLED_MSG };
}

export async function updateUserProfile(_userId: string, _data: { name?: string; role?: string; email?: string }) {
    return { success: false, error: DISABLED_MSG };
}

export async function sendResetPasswordEmail(_userId: string, _email: string) {
    return { success: false, error: DISABLED_MSG };
}
