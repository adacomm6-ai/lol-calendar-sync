'use server'

import { redirect } from 'next/navigation';

export async function login(_formData: FormData) {
    redirect('/admin/schedule');
}

export async function signup(_formData: FormData) {
    redirect('/admin/schedule');
}

export async function requestPasswordReset(_formData: FormData) {
    redirect('/admin/schedule');
}

export async function updatePassword(_formData: FormData) {
    redirect('/admin/schedule');
}

