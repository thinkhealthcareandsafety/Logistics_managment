import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Spinner } from '../components/ui/Loading';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/auth';
import type { User } from '../types/user';
import { getInitials } from '../utils/avatar';

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

export function Profile() {
  const { user, logout, replaceSession } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [endingOthers, setEndingOthers] = useState(false);

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
            {user.lastLoginAt && <Row label="Last sign-in" value={format(new Date(user.lastLoginAt), 'd MMM yyyy, h:mm a')} />}
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

      <ChangePassword
        changedAt={user.passwordChangedAt}
        onChanged={(token, next) => replaceSession(token, next)}
      />

      <section className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-8 lg:grid-cols-3 lg:gap-10">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-950">Session</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            Sign out of this browser - or of every other phone and computer signed in as you, if one was lost or shared.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:col-span-2">
          <button
            onClick={async () => {
              setEndingOthers(true);
              try {
                const res = await authApi.logoutEverywhere();
                replaceSession(res.token, res.user);
                toast.success('Signed out on every other device');
              } catch (err) {
                toast.error(errorMessage(err, 'Could not sign out other devices'));
              } finally {
                setEndingOthers(false);
              }
            }}
            disabled={endingOthers}
            aria-busy={endingOthers}
            className="btn-secondary inline-flex items-center gap-2"
          >
            {endingOthers && <Spinner />}
            Sign out on all other devices
          </button>
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

/** Current password, then a new one twice. Every other session ends when it changes. */
function ChangePassword({ changedAt, onChanged }: { changedAt?: string | null; onChanged: (token: string, user: User) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (next !== repeat) return setError('The two new passwords don’t match');
    if (next.length < 10 || !/[a-z]/i.test(next) || !/\d/.test(next)) {
      return setError('Use at least 10 characters, with both letters and numbers');
    }
    setSaving(true);
    try {
      const res = await authApi.changePassword({ currentPassword: current, newPassword: next });
      onChanged(res.token, res.user);
      setCurrent('');
      setNext('');
      setRepeat('');
      toast.success('Password changed - every other device has been signed out');
    } catch (err) {
      setError(errorMessage(err, 'Could not change the password'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-8 lg:grid-cols-3 lg:gap-10">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-950">Password</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          At least 10 characters with letters and numbers. Changing it signs out every other device.
          {changedAt && <> Last changed {format(new Date(changedAt), 'd MMM yyyy')}.</>}
        </p>
      </div>
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:col-span-2">
        <PasswordField id="pw-current" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PasswordField id="pw-new" label="New password" value={next} onChange={setNext} autoComplete="new-password" />
        <PasswordField id="pw-repeat" label="New password again" value={repeat} onChange={setRepeat} autoComplete="new-password" />
        {error && (
          <p role="alert" className="text-[13px] text-red-600">
            {error}
          </p>
        )}
        <button type="submit" disabled={saving || !current || !next || !repeat} aria-busy={saving} className="btn-primary inline-flex items-center gap-2">
          {saving && <Spinner />}
          {saving ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </section>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-slate-700">
        {label}
      </label>
      <input id={id} type="password" value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className="input" maxLength={128} />
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
