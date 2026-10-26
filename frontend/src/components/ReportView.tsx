import { Link } from 'react-router-dom';
import { relativeDays, type Report } from '../lib/api';

function SegmentedBar({ total }: { total: number }) {
  return (
    <div className="flex gap-[3px]" aria-label={`Score ${total} out of 100`}>
      {Array.from({ length: 25 }).map((_, i) => (
        <span
          key={i}
          className={`h-3 flex-1 ${i < Math.round(total / 4) ? 'bg-[#1d4d2e]' : 'bg-[#d8d2c8]'}`}
        />
      ))}
    </div>
  );
}

export default function ReportView({ report, compareLink }: { report: Report; compareLink?: boolean }) {
  const { repo } = report;
  const maxCommits = Math.max(1, ...(report.weekly ?? []).map((w) => w.commits));
  return (
    <section className="border-t border-[#d8d2c8] pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-4xl font-bold text-black">{repo.full_name.replace('/', ' / ')}</h2>
          <p className="mt-1 font-mono text-sm text-[#6b655c]">
            {repo.language ?? 'Unknown language'}
            {repo.license ? ` · ${repo.license}` : ' · No license'}
            {` · Updated ${relativeDays(repo.pushed_at ?? repo.updated_at)}`}
          </p>
          {repo.description && <p className="mt-2 max-w-2xl text-[#3a362f]">{repo.description}</p>}
        </div>
        {compareLink && (
          <Link
            to={`/compare?repo=${encodeURIComponent(repo.full_name)}`}
            className="border border-black px-4 py-2 font-mono text-sm text-black hover:bg-black hover:text-white"
          >
            Compare another repo ↗
          </Link>
        )}
      </div>

      <div className="mt-8 grid gap-10 border-t border-[#d8d2c8] pt-8 lg:grid-cols-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-[#6b655c]">Repository health score</p>
          <p className="mt-2 font-serif leading-none">
            <span className="text-[120px] font-black text-[#1d4d2e]">{report.total}</span>
            <span className="ml-2 text-4xl text-[#8a847a]">/ 100</span>
          </p>
          <div className="mt-4 max-w-md">
            <SegmentedBar total={report.total} />
          </div>
          <p className="mt-3 font-mono font-bold text-[#1d4d2e]">{report.status}</p>
          <p className="mt-1 text-[#3a362f]">{report.verdict}</p>
          <p className="mt-2 text-sm text-[#6b655c]">
            {repo.stars} stars · {repo.forks} forks · {repo.open_issues} open issues
          </p>
        </div>

        <div>
          <h3 className="font-serif text-2xl font-bold text-black">Every point, explained</h3>
          <div className="mt-4">
            {report.categories.map((c) => (
              <div key={c.id} className="grid grid-cols-[110px_70px_1fr] items-center gap-3 border-b border-[#e5e0d6] py-3 sm:grid-cols-[140px_70px_1fr_180px]">
                <span className="text-sm font-medium text-black">{c.name}</span>
                <span className="font-mono text-sm text-black">
                  {c.points} <span className="text-[#8a847a]">/ {c.max}</span>
                </span>
                <span className="h-2 bg-[#e5e0d6]">
                  <span className="block h-2 bg-[#1d4d2e]" style={{ width: `${(c.points / c.max) * 100}%` }} />
                </span>
                <span className="hidden text-xs text-[#6b655c] sm:block">{c.reason}</span>
              </div>
            ))}
            {report.categories.map((c) => (
              <p key={`${c.id}-m`} className="mt-1 text-xs text-[#6b655c] sm:hidden">
                {c.name}: {c.reason}
              </p>
            ))}
          </div>
          <p className="mt-4 font-mono text-sm text-black">{report.arithmetic}</p>
        </div>
      </div>

      <div className="mt-10 grid gap-10 border-t border-[#d8d2c8] pt-8 lg:grid-cols-[2fr_1fr]">
        <div>
          <h3 className="font-serif text-2xl font-bold text-black">The last 12 weeks</h3>
          <p className="font-mono text-xs text-[#6b655c]">Commit activity · weekly</p>
          {report.weekly_available && report.weekly ? (
            <div className="mt-4 flex h-32 items-end gap-1" role="img" aria-label="Weekly commit activity">
              {report.weekly.map((w) => (
                <div key={w.week_start} className="flex flex-1 flex-col items-center gap-1" title={`${w.week_start}: ${w.commits} commits`}>
                  <span className="text-[10px] text-[#6b655c]">{w.commits}</span>
                  <div className="w-full bg-[#1d4d2e]" style={{ height: `${Math.max(2, (w.commits / maxCommits) * 90)}px` }} />
                  <span className="hidden text-[9px] text-[#8a847a] md:block">{w.week_start.slice(5)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#6b655c]">{report.weekly_note}</p>
          )}
        </div>

        <div>
          <h3 className="font-serif text-2xl font-bold text-black">Next fixes</h3>
          {report.fixes.length === 0 ? (
            <p className="mt-4 text-sm text-[#3a362f]">No fixes flagged by the current checks. That means the checked files and signals are all present — not that the code itself is bug-free.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {report.fixes.map((f, i) => (
                <li key={i} className="flex gap-3">
                  <span className={`h-fit px-2 py-0.5 font-mono text-xs font-bold text-white ${f.priority === 'HIGH' ? 'bg-[#ea580c]' : 'bg-[#b45309]'}`}>
                    {f.priority}
                  </span>
                  <span>
                    <span className="mr-2 inline-block h-4 w-4 border border-black align-middle" aria-hidden />
                    <span className="font-medium text-black">{f.title}</span>
                    <span className="block text-sm text-[#6b655c]">{f.reason}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-10 flex flex-wrap justify-between gap-2 border-t border-[#d8d2c8] pt-4 font-mono text-xs text-[#6b655c]">
        <span>Signals, not guarantees.</span>
        <span>
          Source: {report.source} · Fetched {new Date(report.fetched_at).toLocaleString()}
          {report.cached ? ' · Cached (120s)' : ''}
        </span>
      </p>
    </section>
  );
}
