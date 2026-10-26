const ROWS = [
  { name: 'Activity', max: 30, rules: 'Last push within 7 days: 12, 30 days: 9, 90 days: 6, 365 days: 3, older: 0. Commits in the last 12 weeks: 50+: 10, 20+: 7, 5+: 4, 1+: 2. Weeks with at least one commit: 8+: 5, 4+: 3, 1+: 1. A release exists: 3.' },
  { name: 'Documentation', max: 20, rules: 'README present: 12. An examples, docs, doc or documentation folder present: 8.' },
  { name: 'Issue care', max: 20, rules: 'Issues enabled: 4. Open-issue load: 10 or fewer: 8, 30 or fewer: 6, 100 or fewer: 3, more: 0. Stale unresponded issues (open, zero comments, created over 30 days ago, counted from the first 30 open issues): none: 8, 1–3: 5, 4–10: 2, more: 0.' },
  { name: 'Project setup', max: 15, rules: 'License present: 6. CONTRIBUTING present: 5. .gitignore or a CI workflow under .github/workflows: 4.' },
  { name: 'Community', max: 15, rules: 'SECURITY.md present: 6. Code of conduct present: 5. Stars/forks signal, capped at 4: 1000+ stars or 200+ forks: 4, 100+ stars or 20+ forks: 3, 10+ stars or 5+ forks: 2, at least 1 star: 1. Popularity can never dominate the score.' },
];

export default function Scoring() {
  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-4xl font-black text-black">How scoring works.</h1>
      <p className="mt-3 text-[#3a362f]">
        Every point comes from a GitHub API response for the repository being inspected. Nothing is
        estimated from a name, a language, or an example. The five categories sum to exactly 100,
        and every report shows its own arithmetic (its five category points
        added up to its total out of 100).
      </p>
      <table className="mt-8 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-2 pr-3">Category</th>
            <th className="py-2 pr-3">Max</th>
            <th className="py-2">Exact rules</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.name} className="border-b border-[#e5e0d6] align-top">
              <td className="py-3 pr-3 font-medium text-black">{r.name}</td>
              <td className="py-3 pr-3 font-mono">{r.max}</td>
              <td className="py-3 text-[#3a362f]">{r.rules}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="mt-8 font-serif text-2xl font-bold text-black">Status bands</h2>
      <ul className="mt-3 space-y-1 text-sm text-[#3a362f]">
        <li>80–100: Actively maintained</li>
        <li>50–79: Maintained, with gaps</li>
        <li>30–49: Needs attention</li>
        <li>0–29: At risk</li>
      </ul>
      <h2 className="mt-8 font-serif text-2xl font-bold text-black">Signals, not guarantees</h2>
      <p className="mt-3 text-sm leading-relaxed text-[#3a362f]">
        A high score means the project&apos;s public signals look healthy: it is maintained,
        documented, and set up for contributors. It does not prove the code is correct, secure,
        or suitable for any particular use. Stale-issue counts are counted from the first 30 open
        issues when a repository has more, and weekly commit activity is unavailable while GitHub
        is still computing it (the API returns 202); in that case no volume points are awarded
        and the report says so instead of showing zeros as data. Private repositories cannot be
        inspected without a token and are reported as not found.
      </p>
    </div>
  );
}
