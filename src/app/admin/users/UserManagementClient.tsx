'use client';

import { useState } from 'react';
import { UserView, updateUserProfile, sendResetPasswordEmail } from './actions';
import { useRouter } from 'next/navigation';

export default function UserManagementClient({ initialUsers }: { initialUsers: UserView[] }) {
    const router = useRouter();
    const [users, setUsers] = useState<UserView[]>(initialUsers);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{ name: string, role: string, email: string }>({ name: '', role: 'user', email: '' });
    const [loading, setLoading] = useState(false);
    const [actionStatus, setActionStatus] = useState<{ id: string, message: string, type: 'success' | 'error' | 'loading' } | null>(null);

    const startEdit = (user: UserView) => {
        setEditingId(user.id);
        setEditForm({ name: user.name, role: user.role, email: user.email || '' });
    };

    const cancelEdit = () => {
        setEditingId(null);
    };

    const handleSave = async (id: string) => {
        setLoading(true);
        const res = await updateUserProfile(id, editForm);
        if (res.success) {
            setUsers(users.map(u => u.id === id ? { ...u, ...editForm } : u));
            setEditingId(null);
            router.refresh();
        } else {
            alert(res.error || 'Failed to update');
        }
        setLoading(false);
    };

    const handleSendReset = async (id: string, email: string) => {
        if (!email || email.includes('Unknown')) {
            alert('Cannot send reset email to unidentified user.');
            return;
        }

        setActionStatus({ id, message: 'Sending...', type: 'loading' });
        const res = await sendResetPasswordEmail(id, email);

        if (res.success) {
            setActionStatus({ id, message: 'Email Sent!', type: 'success' });
            setTimeout(() => setActionStatus(null), 3000);
        } else {
            setActionStatus({ id, message: res.error || 'Failed', type: 'error' });
            setTimeout(() => setActionStatus(null), 5000);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        // Better toast would be nice, but simple alert for now matches existing style
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-950 text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-800">
                            <th className="p-4">User Info (ID/Email)</th>
                            <th className="p-4">Display Name</th>
                            <th className="p-4">Role</th>
                            <th className="p-4">Activity</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-sm">
                        {users.map(user => {
                            const isEditing = editingId === user.id;
                            const status = actionStatus?.id === user.id ? actionStatus : null;

                            return (
                                <tr key={user.id} className="hover:bg-slate-800/30 transition-colors cursor-default group">
                                    <td className="p-4">
                                        <div className="flex flex-col gap-1">
                                            {isEditing ? (
                                                <input
                                                    className="bg-slate-950 border border-blue-500 rounded px-2 py-1 text-white text-xs outline-none w-full font-mono"
                                                    value={editForm.email}
                                                    onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                                                    placeholder="User Email"
                                                />
                                            ) : (
                                                <span className="text-white font-medium">{user.email || 'No Email'}</span>
                                            )}

                                            <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono" title={user.id}>
                                                <span>{user.id.substring(0, 16)}...</span>
                                                <button onClick={() => copyToClipboard(user.id)} className="hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    📄
                                                </button>
                                            </div>
                                        </div>
                                    </td>

                                    <td className="p-4">
                                        {isEditing ? (
                                            <input
                                                autoFocus
                                                className="bg-slate-950 border border-blue-500 rounded px-2 py-1 text-white text-sm outline-none w-full"
                                                value={editForm.name}
                                                onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                            />
                                        ) : (
                                            <span className={user.name === 'Unset' ? 'text-slate-500 ' : 'text-slate-200'}>
                                                {user.name}
                                            </span>
                                        )}
                                    </td>

                                    <td className="p-4">
                                        {isEditing ? (
                                            <select
                                                className="bg-slate-950 border border-blue-500 rounded px-2 py-1 text-white text-sm outline-none"
                                                value={editForm.role}
                                                onChange={e => setEditForm(prev => ({ ...prev, role: e.target.value }))}
                                            >
                                                <option value="user">User</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                        ) : (
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${user.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-700/50 text-slate-400'}`}>
                                                {user.role}
                                            </span>
                                        )}
                                    </td>

                                    <td className="p-4">
                                        <div className="flex flex-col text-xs text-slate-500">
                                            <span>Last: {user.lastSignIn ? new Date(user.lastSignIn).toLocaleDateString() : 'Never'}</span>
                                            <span className="text-[10px] opacity-70">Created: {new Date(user.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </td>

                                    <td className="p-4 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                            {status ? (
                                                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded bg-slate-800 ${status.type === 'success' ? 'text-green-400' :
                                                    status.type === 'error' ? 'text-red-400' : 'text-blue-400 animate-pulse'
                                                    }`}>
                                                    {status.message}
                                                </span>
                                            ) : (
                                                !isEditing && user.email && !user.email.includes('Unknown') && (
                                                    <button
                                                        onClick={() => handleSendReset(user.id, user.email!)}
                                                        className="text-slate-500 hover:text-blue-400 transition-colors"
                                                        title="Send Reset Password Email"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                        </svg>
                                                    </button>
                                                )
                                            )}

                                            {isEditing ? (
                                                <div className="flex items-center gap-2 border-l border-slate-800 pl-3 ml-1">
                                                    <button onClick={() => handleSave(user.id)} disabled={loading} className="text-green-400 hover:text-green-300 font-bold text-xs uppercase px-2 py-1 rounded hover:bg-green-400/10">
                                                        {loading ? '...' : 'Save'}
                                                    </button>
                                                    <button onClick={cancelEdit} disabled={loading} className="text-slate-500 hover:text-slate-300 text-xs uppercase px-2 py-1 rounded hover:bg-slate-700/30">
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => startEdit(user)} className="text-blue-400 hover:text-blue-300 font-bold text-xs uppercase px-3 py-1 bg-blue-900/10 hover:bg-blue-900/30 rounded border border-blue-500/20 transition-all">
                                                    Edit
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="p-4 bg-slate-950/50 text-center text-xs text-slate-600 border-t border-slate-800">
                Total Users: {users.length}
            </div>
        </div>
    );
}
