import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function SyncPage() {
    redirect('/admin/settings?tab=health');
}
