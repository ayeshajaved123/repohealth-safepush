import { useState } from 'react';
import { api, ApiError, type Report } from '../lib/api';
import ReportView from '../components/ReportView';

export default function Inspect() {
  const [input, setInput] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const inspect = async (value?: string) => {
    const repo = (value ?? input).trim();
    if (!repo) return;
    setLoading(true);
    setError('');
    setReport(null);
    try {
      setReport(await api.inspect(repo));
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 404) setError('Repository not found or private. Check the owner/repo spelling and try a public repository.');
        else if (e.status === 429) setError(`GitHub rate limit reached: ${e.message} Try again later, or set a GITHUB_TOKEN on the backend.`);
        else if (e.status === 400) setError(e.message);
        else setError(e.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-[#ea580c]">Repository field report</p>
      <h1 className="mt-2 font-serif text-5xl font-black leading-tight text-black sm:text-6xl">
        Good code deserves a health check.
      </h1>
      <form
        className="mt-6 flex max-w-3xl flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          inspect();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="owner/repo or github.com/owner/repo"
          aria-label="Repository"
          className="flex-1 border border-[#c9c2b4] bg-white px-4 py-3 font-mono text-sm text-black outline-none focus:border-black"
        />
        <button type="submit" disabled={loading || !input.trim()} className="bg-black px-6 py-3 font-mono text-sm text-white disabled:opacity-50">
          {loading ? 'Inspecting…' : 'Inspect repo →'}
        </button>
      </form>
      <p className="mt-2 font-mono text-xs text-[#8a847a]">Public repositories · No sign-in required</p>
      <p className="mt-2 text-sm text-[#6b655c]">
        Before you push: <a href="/safepush" className="underline">SafePush</a> checks for leaked secrets and
        outdated dependencies — and gives you the fix, not just a warning.
      </p>

      {error && (
        <p role="alert" className="mt-6 max-w-3xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {loading && <p className="mt-8 text-[#6b655c]">Fetching live data from the GitHub API…</p>}
      {!loading && !report && !error && (
        <div className="mt-10 max-w-3xl border border-[#d8d2c8] bg-white p-6">
          <p className="font-medium text-black">Try a well-known public repository to see a real report.</p>
          <p className="mt-1 text-sm text-[#6b655c]">
            For example, type <button type="button" className="underline" onClick={() => { setInput('facebook/react'); inspect('facebook/react'); }}>facebook/react</button>
            {' '}or <button type="button" className="underline" onClick={() => { setInput('python/cpython'); inspect('python/cpython'); }}>python/cpython</button> and
            press Inspect repo. Every number that follows comes from the GitHub API.
          </p>
        </div>
      )}
      {report && (
        <div className="mt-10">
          <ReportView report={report} compareLink />
        </div>
      )}
    </div>
  );
}
