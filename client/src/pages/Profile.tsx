import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Spinner } from '../components/ui/Loading';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, type Teammate } from '../api/auth';
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

      <Team myId={user.id} />

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

/** Who has an account, and "Add a colleague" - the way in while public sign-up is off. */
function Team({ myId }: { myId: string }) {
  const queryClient = useQueryClient();
  const { data: team, isLoading } = useQuery({ queryKey: ['team'], queryFn: authApi.team });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState<{ name: string; email: string; password: string } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // Arrived from the sign-in page's "Adding a colleague?" link: straight to the form.
  useEffect(() => {
    if (window.location.hash !== '#team') return;
    setOpen(true);
    sectionRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim().toLowerCase().endsWith('@thinkhealth.in')) return setError('Use their @thinkhealth.in work email');
    if (password.length < 10 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      return setError('Use at least 10 characters, with both letters and numbers');
    }
    setSaving(true);
    try {
      const user = await authApi.addTeammate({ name: name.trim(), email: email.trim(), password });
      queryClient.setQueryData<Teammate[]>(['team'], (old) => [...(old || []), user]);
      setAdded({ name: user.name, email: user.email, password });
      setName('');
      setEmail('');
      setPassword('');
      setOpen(false);
      toast.success(`${user.name} can sign in now`);
    } catch (err) {
      setError(errorMessage(err, 'Could not add the colleague'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section ref={sectionRef} id="team" className="grid scroll-mt-20 grid-cols-1 gap-4 border-t border-slate-200 pt-8 lg:grid-cols-3 lg:gap-10">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-950">Team</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          Everyone who can sign in. Add a colleague with their work email and a starting password - they can change it on
          their own Profile page.
        </p>
      </div>
      <div className="space-y-3 lg:col-span-2">
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {isLoading && <li className="px-5 py-3 text-slate-400">Loading…</li>}
          {team?.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-900">
                {getInitials(m.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">
                  {m.name}
                  {m.id === myId && <span className="ml-1.5 font-normal text-slate-400">(you)</span>}
                </span>
                <span className="block truncate text-slate-500">{m.email}</span>
              </span>
              <span className="shrink-0 text-right text-[12px] text-slate-400">
                {m.lastLoginAt ? `Last in ${format(new Date(m.lastLoginAt), 'd MMM')}` : 'Not signed in yet'}
              </span>
            </li>
          ))}
        </ul>

        {added && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
            <p className="font-semibold">{added.name} is added. Send them:</p>
            <p className="mt-1 break-all font-mono text-[12px]">
              {window.location.origin}/login · {added.email} · {added.password}
            </p>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                className="font-semibold text-emerald-800 hover:underline"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(
                      `Your ThinkHealth Logistics account is ready.\nSign in: ${window.location.origin}/login\nEmail: ${added.email}\nPassword: ${added.password}\nPlease change the password from Profile after signing in.`
                    )
                    .then(() => toast.success('Copied'), () => toast.error('Could not copy'));
                }}
              >
                Copy sign-in details
              </button>
              <button type="button" className="text-emerald-700 hover:underline" onClick={() => setAdded(null)}>
                Done
              </button>
            </div>
          </div>
        )}

        {open ? (
          <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div>
              <label htmlFor="tm-name" className="mb-1 block text-[13px] font-medium text-slate-700">
                Full name
              </label>
              <input id="tm-name" required value={name} onChange={(e) => setName(e.target.value)} className="input" maxLength={100} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="tm-email" className="mb-1 block text-[13px] font-medium text-slate-700">
                Work email
              </label>
              <input id="tm-email" required type="email" placeholder="name@thinkhealth.in" value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="tm-password" className="mb-1 block text-[13px] font-medium text-slate-700">
                Starting password
              </label>
              <input id="tm-password" required type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="input font-mono" maxLength={128} autoComplete="new-password" />
              <p className="mt-1 text-[12px] text-slate-500">At least 10 characters with letters and numbers. You'll see it once to send to them.</p>
            </div>
            {error && (
              <p role="alert" className="text-[13px] text-red-600">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button type="submit" disabled={saving} aria-busy={saving} className="btn-primary inline-flex items-center gap-2">
                {saving && <Spinner />}
                {saving ? 'Adding…' : 'Add colleague'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setOpen(false); setError(''); }}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn-secondary" onClick={() => { setOpen(true); setAdded(null); }}>
            + Add a colleague
          </button>
        )}
      </div>
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
