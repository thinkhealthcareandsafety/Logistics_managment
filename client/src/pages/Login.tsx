import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui/Loading';

export function Login() {
  const [searchParams] = useSearchParams();
  // The landing page's "Get started" links straight to the register tab.
  const [mode, setMode] = useState<'login' | 'register'>(
    searchParams.get('mode') === 'register' ? 'register' : 'login'
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-32 h-[400px] bg-[radial-gradient(55%_55%_at_50%_0%,rgba(44,130,144,0.14),transparent_70%)]"
      />

      <div className="relative w-full max-w-sm">
        <Link to="/" className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-900 text-lg font-bold text-white">
            TH
          </span>
          <span>
            <span className="block text-xl font-semibold text-slate-900">ThinkHealth Logistics</span>
            <span className="mt-1 block text-sm text-slate-500">Shipment tracking dashboard</span>
          </span>
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lift">
          <div className="mb-5 flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
            <button
              className={`flex-1 rounded-lg py-1.5 transition ${
                mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
              onClick={() => setMode('login')}
              type="button"
            >
              Sign in
            </button>
            <button
              className={`flex-1 rounded-lg py-1.5 transition ${
                mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
              onClick={() => setMode('register')}
              type="button"
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <Field label="Full name" htmlFor="name">
                <input
                  id="name"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                />
              </Field>
            )}
            <Field
              label="Work email"
              htmlFor="email"
              hint={mode === 'register' ? 'Accounts are for ThinkHealth staff - use your company email.' : undefined}
            >
              <input
                id="email"
                required
                type="email"
                autoComplete="email"
                placeholder="name@thinkhealth.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              hint={mode === 'register' ? 'At least 8 characters.' : undefined}
            >
              <div className="relative">
                <input
                  id="password"
                  required
                  type={showPassword ? 'text' : 'password'}
                  minLength={8}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  aria-controls="password"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-400 outline-none transition hover:text-slate-700 focus-visible:text-slate-700 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </Field>
            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-80"
            >
              {isSubmitting && <Spinner />}
              {isSubmitting
                ? mode === 'login'
                  ? 'Signing in…'
                  : 'Creating account…'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>

          {/* Seeded credentials are a local-dev convenience; never print them on the real site. */}
          {import.meta.env.DEV && (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
              Dev only - demo login: demo@thinkhealth.in / Demo@12345
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Just tracking a parcel?{' '}
          <Link to="/#track" className="font-medium text-brand-700 hover:text-brand-900">
            Look it up without an account
          </Link>
        </p>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.9 3.9M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" strokeLinecap="round" />
    </svg>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
