import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, type CompareResponse } from '../lib/api';
import ReportView from '../components/ReportView';

export default function Compare() {
  const [params] = useSearchParams();
  const [a, setA] = useState(params.get('repo') ?? '');
  const [b, setB] = useState('');
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    if (!a.trim() || !b.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      setResult(await api.compare(a.trim(), b.trim()));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Comparison failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="font-serif text-4xl font-black text-black">Compare two repositories.</h1>
      <p className="mt-2 text-[#3a362f]">Same scoring formula, side by side. The winner is decided by total score only; category deltas show where each repo leads.</p>
      <form
        className="mt-6 flex max-w-3xl flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <input value={a} onChange={(e) => setA(e.target.value)} placeholder="First repo: owner/repo" aria-label="First repository" className="border border-[#c9c2b4] bg-white px-4 py-3 font-mono text-sm outline-none focus:border-black" />
        <input value={b} onChange={(e) => setB(e.target.value)} placeholder="Second repo: owner/repo" aria-label="Second repository" className="border border-[#c9c2b4] bg-white px-4 py-3 font-mono text-sm outline-none focus:border-black" />
        <button type="submit" disabled={loading || !a.trim() || !b.trim()} className="w-fit bg-black px-6 py-3 font-mono text-sm text-white disabled:opacity-50">
          {loading ? 'Comparing…' : 'Compare repos →'}
        </button>
      </form>
      {error && <p role="alert" className="mt-6 max-w-3xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}
      {loading && <p className="mt-8 text-[#6b655c]">Fetching both reports from the GitHub API…</p>}
      {result && (
        <div className="mt-10">
          <p className="font-mono text-sm text-black">
            {result.winner ? `Winner: ${result.winner} (${result.a.total} vs ${result.b.total})` : `Tie: both scored ${result.a.total} / 100.`}
          </p>
          <table className="mt-4 w-full max-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">{result.a.repo.full_name}</th>
                <th className="py-2 pr-3">{result.b.repo.full_name}</th>
                <th className="py-2">Delta (A − B)</th>
              </tr>
            </thead>
            <tbody>
              {result.deltas.map((d) => (
                <tr key={d.id} className="border-b border-[#e5e0d6]">
                  <td className="py-2 pr-3">{d.name}</td>
                  <td className="py-2 pr-3 font-mono">{d.a_points}</td>
                  <td className="py-2 pr-3 font-mono">{d.b_points}</td>
                  <td className={`py-2 font-mono ${d.delta > 0 ? 'text-[#1d4d2e]' : d.delta < 0 ? 'text-red-800' : ''}`}>
                    {d.delta > 0 ? `+${d.delta}` : d.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-10 space-y-14">
            <ReportView report={result.a} />
            <ReportView report={result.b} />
          </div>
        </div>
      )}
    </div>
  );
}
