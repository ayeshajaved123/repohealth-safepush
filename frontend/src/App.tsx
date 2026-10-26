import { Link, NavLink, Route, Routes } from 'react-router-dom';
import Inspect from './pages/Inspect';
import Compare from './pages/Compare';
import Scoring from './pages/Scoring';
import SafePush from './pages/SafePush';

function GitHubMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" aria-label="GitHub">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export default function App() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `px-1 py-1 font-mono text-sm ${isActive ? 'border-b-2 border-[#1d4d2e] font-bold text-black' : 'text-[#3a362f] hover:text-black'}`;
  return (
    <div className="min-h-screen bg-[#faf8f5] text-black">
      <header className="border-b border-[#d8d2c8]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-black">
            <span aria-hidden>⌥</span> RepoHealth
          </Link>
          <nav className="flex gap-5">
            <NavLink to="/" end className={link}>Inspect</NavLink>
            <NavLink to="/compare" className={link}>Compare</NavLink>
            <NavLink to="/safepush" className={link}>SafePush</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <NavLink to="/scoring" className="font-mono text-sm text-[#3a362f] hover:text-black">How scoring works</NavLink>
            <span className="hidden text-[#d8d2c8] sm:inline">|</span>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="text-black" aria-label="GitHub">
              <GitHubMark />
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Routes>
          <Route path="/" element={<Inspect />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/scoring" element={<Scoring />} />
          <Route path="/safepush" element={<SafePush />} />
          <Route path="*" element={<Inspect />} />
        </Routes>
      </main>
    </div>
  );
}
