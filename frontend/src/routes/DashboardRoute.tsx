import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, auth, homeworkSets, problems, type HomeworkSet } from '../lib/api';

interface CourseCardView {
  id: string;
  title: string;
  description: string;
  term: string;
  initials: string;
  problemId?: string;
}

const SAMPLE_COURSES: CourseCardView[] = [
  {
    id: 'sample-advising',
    title: 'ECE Student Advising Resources',
    description: 'ECE Student Advising Resources and Information',
    term: 'Spring 2025',
    initials: 'ECE',
  },
  {
    id: 'sample-ee-242',
    title: 'E E 242 A',
    description: 'D.C. to 26 Signals, Systems, and Transforms',
    term: 'Spring 2025',
    initials: 'E',
  },
  {
    id: 'sample-ee-271',
    title: 'E E 271 A',
    description: 'Digital Circuits And Systems',
    term: 'Spring 2025',
    initials: 'E',
  },
  {
    id: 'sample-ee-280',
    title: 'E E 280 A',
    description: 'Exploring Design',
    term: 'Spring 2025',
    initials: 'E',
  },
  {
    id: 'sample-grad-advising',
    title: 'ECE Graduate Program Advising',
    description: 'ECE Graduate Program Advising Resources',
    term: 'Summer 2025',
    initials: 'ECE',
  },
  {
    id: 'sample-fin-250',
    title: 'FIN 250 A',
    description: 'Personal Finance',
    term: 'Fall 2024',
    initials: 'FIN',
  },
  {
    id: 'sample-placeholder',
    title: 'COURSE ### X',
    description: 'Course Title Here',
    term: 'Quarter Year',
    initials: '?',
  },
];

const TOPIC_LABEL: Record<string, string> = {
  kvl: 'KVL', kcl: 'KCL', phasors: 'Phasors', impedance: 'Impedance', thevenin: 'Thevenin',
};
const COURSE_LEVEL_LABEL: Record<string, string> = {
  intro: 'Intro circuits', intermediate: 'Intermediate circuits', advanced: 'Advanced circuits',
};

function toCourseCard(set: HomeworkSet): CourseCardView {
  const topic = set.topic ? TOPIC_LABEL[set.topic] ?? set.topic : 'Course';
  const level = COURSE_LEVEL_LABEL[set.course_level] ?? set.course_level;
  const firstProblem = set.problems[0];
  return {
    id: set.id,
    title: set.name,
    description: `${level} ${topic} problem set`,
    term: 'Spring 2025',
    initials: set.name.match(/[A-Za-z0-9]+/g)?.slice(0, 4).map(w => w[0]).join('').toUpperCase() || topic.slice(0, 4).toUpperCase() || '?',
    problemId: firstProblem?.id,
  };
}

export function DashboardRoute() {
  const navigate = useNavigate();
  const [sets, setSets] = useState<HomeworkSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [openingCourseId, setOpeningCourseId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadHomeworkSets() {
      try {
        const result = await homeworkSets.list();
        if (!active) return;
        setSets(result);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof ApiError ? err.message : 'Unable to load dashboard courses');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadHomeworkSets();
    return () => { active = false; };
  }, []);

  // Real DB courses first, then sample placeholders.
  const courses = useMemo(() => [...sets.map(toCourseCard), ...SAMPLE_COURSES], [sets]);

  async function handleLogout() {
    setLoggingOut(true);
    setError(null);
    try {
      await auth.logout();
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to log out');
    } finally {
      setLoggingOut(false);
    }
  }

  async function openCourse(course: CourseCardView) {
    setOpeningCourseId(course.id);
    setError(null);
    try {
      if (course.problemId) {
        navigate(`/problems/${course.problemId}`, { state: { setName: course.title } });
        return;
      }
      if (course.id.startsWith('sample-')) return; // placeholder — no problem to open
      const next = await problems.next();
      navigate(`/problems/${next.id}`, { state: { setName: course.title } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to open an assignment for this course');
    } finally {
      setOpeningCourseId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-['IBM_Plex_Sans',sans-serif] text-black">
      <header className="border-b border-[#E1E1E1] bg-white">
        <div className="mx-auto flex min-h-[110px] w-full max-w-[1249px] flex-col justify-center px-8">
          <h1 className="text-[28px] leading-9 font-bold">Dashboard</h1>
          <p className="mt-1 text-sm leading-[21px] text-[#5D5D5D]">
            Welcome back to your courses
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1249px] px-8 py-8">
        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
            {error}
          </p>
        )}
        {loading && (
          <p className="mb-4 text-sm text-[#5D5D5D]">Loading your courses...</p>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              opening={openingCourseId === course.id}
              onOpen={() => openCourse(course)}
            />
          ))}
        </div>
      </main>

      <div className="fixed right-6 bottom-6 z-20 flex flex-col items-end gap-2">
        {accountOpen && (
          <div className="w-[170px] overflow-hidden rounded-xl border border-[#E1E1E1] bg-white shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
            <div className="border-b border-[#F3F4F6] px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#99A1AF]">Account</p>
              <p className="mt-1 text-sm font-semibold">Student</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full px-4 py-3 text-left text-sm font-semibold text-[#364153] transition hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loggingOut ? 'Logging out...' : 'Log out'}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setAccountOpen((open) => !open)}
          className="flex h-14 w-[171px] items-center gap-3 rounded-xl border border-[#E1E1E1] bg-white px-[21px] shadow-[0_2px_8px_rgba(0,0,0,0.10)] transition hover:bg-[#F8F9FA]"
          aria-expanded={accountOpen}
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-[#F3F4F6] text-[#4A5565]">
            <UserIcon />
          </span>
          <span className="flex-1 text-center text-[15px] leading-[22.5px] font-semibold">
            Account
          </span>
          <ChevronIcon open={accountOpen} />
        </button>
      </div>
    </div>
  );
}

function CourseCard({
  course,
  opening,
  onOpen,
}: {
  course: CourseCardView;
  opening: boolean;
  onOpen: () => void;
}) {
  const clickable = !!course.problemId;
  return (
    <article
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onOpen : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } : undefined}
      className={[
        'overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.10),0_1px_2px_rgba(0,0,0,0.10)] transition',
        clickable ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(0,0,0,0.10)] hover:border-[#615FFF]/40 focus:outline-none focus:ring-2 focus:ring-[#615FFF]/30' : '',
      ].join(' ')}
      aria-label={clickable ? `Open ${course.title}` : undefined}
    >
      <div className="flex h-40 items-center justify-center bg-[linear-gradient(157deg,#615FFF_0%,#4A47CC_100%)]">
        <p className="text-5xl leading-[72px] font-bold text-white/20">{course.initials}</p>
      </div>

      <div className="flex min-h-[180px] flex-col gap-3 p-4">
        <div className="min-h-0 flex-1">
          <h2 className="truncate text-base leading-6 font-bold text-black">{course.title}</h2>
          <p className="mt-6 truncate text-[13px] leading-[19.5px] text-[#5D5D5D]">
            {course.description}
          </p>
          <p className="mt-1 text-xs leading-[18px] font-medium tracking-[0.05em] text-[#99A1AF] uppercase">
            {opening ? 'Opening assignment...' : course.term}
          </p>
        </div>

        <div className="flex gap-3 border-t border-[#F3F4F6] pt-[9px]">
          <IconButton label="Course calendar" onClick={(e) => e.stopPropagation()}>
            <CalendarIcon />
          </IconButton>
          <IconButton label="Expand course details" onClick={(e) => e.stopPropagation()}>
            <ChevronDownIcon />
          </IconButton>
          <IconButton
            label="Open course work"
            disabled={!clickable || opening}
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
          >
            <DocumentIcon />
          </IconButton>
        </div>
      </div>
    </article>
  );
}

function IconButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: ReactNode;
  label: string;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-md text-[#62748E] transition hover:bg-[#F8F9FA] disabled:cursor-default disabled:opacity-80"
    >
      {children}
    </button>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-[#4A5565]" fill="none" stroke="currentColor" strokeWidth="2">
      <path d={open ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 2v4M16 2v4M3 10h18" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
