export interface Category {
  id: string;
  name: string;
  points: number;
  max: number;
  reason: string;
}

export interface Fix {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  reason: string;
}

export interface WeeklyPoint {
  week_start: string;
  commits: number;
}

export interface RepoInfo {
  full_name: string;
  description: string | null;
  language: string | null;
  license: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  pushed_at: string | null;
  updated_at: string | null;
  html_url: string;
  default_branch: string | null;
}

export interface Report {
  repo: RepoInfo;
  total: number;
  status: string;
  verdict: string;
  categories: Category[];
  arithmetic: string;
  weekly: WeeklyPoint[] | null;
  weekly_available: boolean;
  weekly_note: string | null;
  stale_issues: number;
  fixes: Fix[];
  fetched_at: string;
  source: string;
  cached: boolean;
}

export interface Delta {
  id: string;
  name: string;
  a_points: number;
  b_points: number;
  delta: number;
}

export interface CompareResponse {
  a: Report;
  b: Report;
  deltas: Delta[];
  winner: string | null;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`);
  } catch {
    throw new ApiError(0, 'Could not reach the backend. Is it running on port 8000?');
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === 'string') message = body.detail;
    } catch {
      // A non-JSON error (usually the dev-server proxy returning HTML)
      // means the backend itself was not reachable at all.
      message =
        res.status === 500
          ? 'Backend is not responding. Check the backend terminal is still running on port 8000, then try again.'
          : `Backend returned ${res.status} with no message. Is the backend still running?`;
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export interface DepPackage {
  name: string;
  spec: string;
  current: string | null;
  latest: string | null;
  diff: string;
  risk: string;
  safe: boolean;
}

export interface DepResponse {
  kind: string;
  packages: DepPackage[];
  safe: string[];
  major: string[];
}

export const api = {
  inspect: (repo: string) => get<Report>(`/inspect?repo=${encodeURIComponent(repo)}`),
  compare: (a: string, b: string) =>
    get<CompareResponse>(`/compare?repo=${encodeURIComponent(a)}&repo=${encodeURIComponent(b)}`),
  deps: async (filename: string, content: string): Promise<DepResponse> => {
    let res: Response;
    try {
      res = await fetch('/api/deps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content }),
      });
    } catch {
      throw new ApiError(0, 'Could not reach the backend. Is it running on port 8000?');
    }
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (typeof body.detail === 'string') message = body.detail;
      } catch {
        message = 'Backend is not responding. Check the backend terminal is still running on port 8000, then try again.';
      }
      throw new ApiError(res.status, message);
    }
    return res.json() as Promise<DepResponse>;
  },
};

export function relativeDays(iso: string | null): string {
  if (!iso) return 'unknown';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}
