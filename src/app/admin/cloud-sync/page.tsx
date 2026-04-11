import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function CloudSyncPage() {
    redirect('/admin/settings?tab=health');
}
