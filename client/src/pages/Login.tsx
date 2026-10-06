import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const [searchParams] = useSearchParams();
  // The landing page's "Get started" links straight to the register tab.
  const [mode, setMode] = useState<'login' | 'register'>(
    searchParams.get('mode') === 'register' ? 'register' : 'login'
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
              <input
                id="password"
                required
                type="password"
                minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </Field>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
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
