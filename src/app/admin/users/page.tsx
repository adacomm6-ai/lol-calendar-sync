import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function UserManagementPage() {
    redirect('/admin/settings?tab=general');
}
