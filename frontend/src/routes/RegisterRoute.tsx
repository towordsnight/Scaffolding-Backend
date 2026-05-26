import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ApiError, auth, type CourseLevel } from '../lib/api';

const COURSE_LEVELS: { value: CourseLevel; label: string }[] = [
  { value: 'intro',        label: 'Intro — First circuits course' },
  { value: 'intermediate', label: 'Intermediate — AC circuits' },
  { value: 'advanced',     label: 'Advanced — Graduate level' },
];

export function RegisterRoute() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [netid, setNetid]             = useState('');
  const [password, setPassword]       = useState('');
  const [courseLevel, setCourseLevel] = useState<CourseLevel>('intro');
  const [consent, setConsent]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!consent) {
      setError('You must agree to the privacy notice to continue.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const email = netid.includes('@') ? netid : `${netid.trim()}@uw.edu`;
      await auth.register({
        email,
        password,
        display_name: displayName.trim() || undefined,
        course_level: courseLevel,
        consent: true,
      });
      navigate('/onboarding/self-declare');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] font-['IBM_Plex_Sans',sans-serif] py-10">
      <div className="w-[430px] rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        <div className="flex flex-col gap-6 p-[42px]">

          <header className="flex flex-col items-center gap-2">
            <h1 className="text-[22px] leading-[33px] font-bold text-black">Create Account</h1>
            <p className="text-sm leading-[21px] text-[#5D5D5D]">
              Set up your ECE Adaptive Scaffold account
            </p>
          </header>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Field
              id="displayName"
              label="Display Name (optional)"
              type="text"
              value={displayName}
              onChange={setDisplayName}
              placeholder="e.g. Alex"
              autoComplete="name"
            />
            <Field
              id="netid"
              label="UW Net ID"
              type="text"
              value={netid}
              onChange={setNetid}
              placeholder="e.g. byleth"
              autoComplete="username"
              required
            />
            <Field
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Choose a password"
              autoComplete="new-password"
              required
            />

            <div className="flex flex-col gap-1">
              <label
                htmlFor="courseLevel"
                className="text-xs font-bold uppercase tracking-[0.05em] text-[#99A1AF]"
              >
                Course Level
              </label>
              <select
                id="courseLevel"
                value={courseLevel}
                onChange={(e) => setCourseLevel(e.target.value as CourseLevel)}
                className="h-[50px] rounded-[10px] border border-[#E5E7EB] bg-[#F9FBFC] px-4 text-[15px] text-black focus:border-[#615FFF] focus:outline-none focus:ring-2 focus:ring-[#615FFF]/20"
              >
                {COURSE_LEVELS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-[3px] h-4 w-4 flex-shrink-0 rounded border-[#E5E7EB] accent-[#615FFF]"
              />
              <span className="text-sm leading-[21px] text-[#5D5D5D]">
                I have read and agree to the{' '}
                <span className="font-medium text-[#615FFF]">FERPA privacy notice</span>.
                My data will be used only for adaptive learning research.
              </span>
            </label>

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
              {submitting ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-[#5D5D5D]">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-[#615FFF] hover:underline">
              Sign in
            </Link>
          </p>

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
