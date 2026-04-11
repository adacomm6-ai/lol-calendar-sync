import { redirect } from 'next/navigation';

export default function ErrorPage() {
    redirect('/admin/schedule');
}

