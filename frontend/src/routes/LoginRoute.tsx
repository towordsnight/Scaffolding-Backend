import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ApiError, auth } from '../lib/api';

export function LoginRoute() {
  const navigate = useNavigate();
  const [netid, setNetid] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const email = netid.includes('@') ? netid : `${netid.trim()}@uw.edu`;
      await auth.login({ email, password });
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex min-h-[80vh] items-center justify-center bg-[#F8F9FA] font-['IBM_Plex_Sans',sans-serif]"
    >
      <div className="w-[430px] rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        <div className="flex flex-col gap-8 p-[42px]">
          <header className="flex flex-col items-center gap-2">
            <h1 className="text-[22px] leading-[33px] font-bold text-black">Sign In</h1>
            <p className="text-sm leading-[21px] text-[#5D5D5D]">
              Enter your UW credentials to continue
            </p>
          </header>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <Field
              id="netid"
              label="UW NET ID"
              type="text"
              value={netid}
              onChange={setNetid}
              placeholder="Enter your NetID"
              autoComplete="username"
              required
            />
            <Field
              id="password"
              label="PASSWORD"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />

            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="h-[50px] w-full rounded-[10px] bg-[#615FFF] text-[15px] font-bold leading-[22.5px] text-white shadow-sm transition hover:bg-[#5350e6] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => alert('Password reset is not available yet.')}
              className="text-sm font-medium text-[#615FFF] hover:underline"
            >
              Forgot your password?
            </button>
            <p className="text-sm text-[#5D5D5D]">
              Don't have an account?{' '}
              <Link to="/register" className="font-medium text-[#615FFF] hover:underline">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  type: 'text' | 'password';
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  autoComplete: string;
  required?: boolean;
}

function Field({ id, label, type, value, onChange, placeholder, autoComplete, required }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-xs font-bold uppercase tracking-[0.05em] text-[#99A1AF]"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="h-[50px] rounded-[10px] border border-[#E5E7EB] bg-[#F9FBFC] px-4 text-[15px] text-black placeholder:text-[#99A1AF] focus:border-[#615FFF] focus:outline-none focus:ring-2 focus:ring-[#615FFF]/20"
      />
    </div>
  );
}
