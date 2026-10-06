import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Spinner } from '../components/ui/Loading';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { getInitials } from '../utils/avatar';

export function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-slate-950">Profile</h1>
        <p className="mt-1 text-[13px] text-slate-500">Your account on ThinkHealth Logistics.</p>
      </div>

      <section className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-8 lg:grid-cols-3 lg:gap-10">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-950">Account</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            The name teammates see on exception notes, and the email you sign in with.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:col-span-2">
          <div className="flex items-center gap-4 p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-900 text-base font-bold text-white">
              {getInitials(user.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-slate-900">{user.name}</p>
              <p className="truncate text-[13px] text-slate-500">{user.email}</p>
            </div>
          </div>
          <dl className="divide-y divide-slate-100 border-t border-slate-100 text-[13px]">
            <Row label="Full name" value={user.name} />
            <Row label="Work email" value={user.email} />
            <Row label="Organisation" value={user.company || '—'} />
            <Row label="Member since" value={format(new Date(user.createdAt), 'd MMMM yyyy')} />
          </dl>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-8 lg:grid-cols-3 lg:gap-10">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-950">Notifications</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">Channels and which status changes reach you.</p>
        </div>
        <div className="lg:col-span-2">
          <Link to="/settings" className="btn-secondary inline-block">
            Manage notification settings
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-8 lg:grid-cols-3 lg:gap-10">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-950">Session</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">Sign out of this browser.</p>
        </div>
        <div className="lg:col-span-2">
          <button
            onClick={handleLogout}
            disabled={signingOut}
            aria-busy={signingOut}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-wait disabled:opacity-80"
          >
            {signingOut && <Spinner />}
            {signingOut ? 'Signing out…' : 'Log out'}
          </button>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 px-5 py-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}
