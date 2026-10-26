import { useMemo, useState } from 'react';
import { api, ApiError, type DepResponse } from '../lib/api';

// ---------- secret scanner (client-side only: no network call at all) ----------

type Finding = {
  file: string;
  line: number;
  type: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  masked: string;
  fix: string;
  envName: string;
  start: number;
  end: number;
  lineText: string;
};

const PATTERNS: { type: string; severity: Finding['severity']; env: string; re: RegExp }[] = [
  { type: 'AWS access key', severity: 'HIGH', env: 'AWS_ACCESS_KEY_ID', re: /AKIA[0-9A-Z]{16}/g },
  { type: 'GitHub token', severity: 'HIGH', env: 'GITHUB_TOKEN', re: /(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}/g },
  { type: 'Slack token', severity: 'HIGH', env: 'SLACK_TOKEN', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { type: 'OpenAI API key', severity: 'HIGH', env: 'OPENAI_API_KEY', re: /sk-[A-Za-z0-9]{20,}/g },
  { type: 'Private key', severity: 'HIGH', env: 'PRIVATE_KEY', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { type: 'JWT', severity: 'LOW', env: 'JWT_TOKEN', re: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  { type: 'API key / password / secret', severity: 'MEDIUM', env: '', re: /(api[_-]?key|apikey|token|password|passwd|secret|client[_-]?secret)\s*[:=]\s*["']([^"'\s]{8,})["']/gi },
  { type: 'Long token near a key word', severity: 'LOW', env: '', re: /(?:key|token|secret)[^A-Za-z0-9]{0,20}["']?([A-Fa-f0-9]{32,})["']?/gi },
];

function mask(value: string): string {
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function scanText(file: string, text: string): Finding[] {
  const out: Finding[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((lineText, idx) => {
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = p.re.exec(lineText)) !== null) {
        // For assignment patterns the secret is capture group 2, else group 0/1.
        const value = m[2] ?? m[1] ?? m[0];
        const start = lineText.indexOf(value, m.index);
        let env = p.env;
        if (!env) {
          const varName = m[1] ? m[1].replace(/-/g, '_').toUpperCase() : '';
          env = varName || `SECRET_${out.length + 1}`;
        }
        out.push({
          file, line: idx + 1, type: p.type, severity: p.severity,
          masked: mask(value), fix: `Move to environment variable ${env} (never commit the value).`,
          envName: env, start: start < 0 ? m.index : start,
          end: (start < 0 ? m.index : start) + value.length, lineText,
        });
        if (m[0].length === 0) p.re.lastIndex++;
      }
    }
  });
  return out;
}

const EXAMPLE_TEXT = `# EXAMPLE ONLY — this is a fake key, not a real secret.
OPENAI_API_KEY = "sk-EXAMPLEFAKEKEY00000000000000000000"
api_key = "example1234567890abcdef"
`;

const GITIGNORE_TEXT = `.env
node_modules/
__pycache__/
.venv/
dist/
*.pem
*.key
`;

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- page ----------

export default function SafePush() {
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [pasted, setPasted] = useState('');
  const [depFileName, setDepFileName] = useState('requirements.txt');
  const [depText, setDepText] = useState('');
  const [depResult, setDepResult] = useState<DepResponse | null>(null);
  const [depLoading, setDepLoading] = useState(false);
  const [depError, setDepError] = useState('');

  const findings = useMemo(() => {
    const all: Finding[] = [];
    for (const f of files) all.push(...scanText(f.name, f.text));
    if (pasted.trim()) all.push(...scanText('pasted-text', pasted));
    return all;
  }, [files, pasted]);

  const highSecrets = findings.filter((f) => f.severity === 'HIGH').length;
  const highDeps = depResult ? depResult.packages.filter((p) => p.risk === 'HIGH').length : 0;
  const verdict = highSecrets === 0 ? 'Ready to push' : 'Fix first';

  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    const read: { name: string; text: string }[] = [];
    for (const file of Array.from(list)) {
      read.push({ name: file.name, text: await file.text() });
    }
    setFiles((prev) => [...prev, ...read]);
  };

  const fixedDownloads = () => {
    // Fixed text per file: replace each finding (from the end, so offsets hold).
    const byFile = new Map<string, Finding[]>();
    for (const f of findings) {
      const arr = byFile.get(f.file) ?? [];
      arr.push(f);
      byFile.set(f.file, arr);
    }
    const sources = new Map<string, string>();
    for (const f of files) sources.set(f.name, f.text);
    if (pasted.trim()) sources.set('pasted-text', pasted);
    for (const [name, list] of byFile) {
      let text = sources.get(name) ?? '';
      const sorted = [...list].sort((a, b) => b.start - a.start);
      // Offsets are per line, so rebuild line by line for correctness.
      const lines = text.split('\n');
      for (const f of sorted) {
        const lineIdx = f.line - 1;
        if (lines[lineIdx] === undefined) continue;
        const line = lines[lineIdx];
        // Replace only the first occurrence of the secret value on that line.
        lines[lineIdx] = line.replace(/([A-Za-z0-9_\-./+=]{8,})/, (match) => {
          // Only replace if this line segment contains a masked match; use env placeholder.
          return match === line.slice(f.start, f.end) ? `$${f.envName}` : match;
        });
        // Simpler, robust fallback: if the line still contains the original
        // value shape, replace the token at the recorded span when possible.
        if (lines[lineIdx] === line && f.start >= 0 && f.end <= line.length) {
          lines[lineIdx] = line.slice(0, f.start) + `$${f.envName}` + line.slice(f.end);
        }
      }
      download(`fixed-${name.replace(/[^A-Za-z0-9._-]/g, '_')}`, lines.join('\n'));
    }
    const envNames = [...new Set(findings.map((f) => f.envName))];
    download('.env.example', envNames.map((n) => `${n}=`).join('\n') + '\n');
    download('.gitignore', GITIGNORE_TEXT);
  };

  const checkDeps = async () => {
    if (!depText.trim()) return;
    setDepLoading(true);
    setDepError('');
    setDepResult(null);
    try {
      setDepResult(await api.deps(depFileName, depText));
    } catch (e) {
      setDepError(e instanceof ApiError ? e.message : 'Dependency check failed.');
    } finally {
      setDepLoading(false);
    }
  };

  const downloadUpdatedDeps = () => {
    if (!depResult) return;
    if (depResult.kind === 'npm') {
      try {
        const data = JSON.parse(depText) as Record<string, unknown>;
        const byName = new Map(depResult.packages.map((p) => [p.name, p]));
        for (const section of ['dependencies', 'devDependencies']) {
          const depsObj = data[section] as Record<string, string> | undefined;
          if (!depsObj) continue;
          for (const name of Object.keys(depsObj)) {
            const pkg = byName.get(name);
            if (pkg && pkg.safe && pkg.latest) {
              const prefix = depsObj[name].match(/^(\^|~|>=|<=|>|<|=)/)?.[1] ?? '';
              depsObj[name] = prefix + pkg.latest;
            }
          }
        }
        download('package.updated.json', JSON.stringify(data, null, 2) + '\n');
      } catch {
        setDepError('Could not re-serialise package.json.');
      }
    } else {
      const lines = depText.split('\n').map((line) => {
        const trimmed = line.trim();
        const m = trimmed.match(/^([A-Za-z0-9_.\-]+)/);
        if (!m) return line;
        const pkg = depResult.packages.find((p) => p.name === m[1]);
        if (pkg && pkg.safe && pkg.latest) return `${pkg.name}==${pkg.latest}`;
        return line;
      });
      download('requirements.updated.txt', lines.join('\n'));
    }
  };

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-[#ea580c]">Pre-push check</p>
      <h1 className="mt-2 font-serif text-5xl font-black leading-tight text-black sm:text-6xl">SafePush: fix before you push.</h1>
      <p className="mt-3 max-w-3xl text-[#6b655c]">
        Health score alone does not catch a leaked key or a breaking dependency. SafePush adds both checks —
        and the fix, not just the warning.
      </p>

      <div className="mt-8 border border-[#d8d2c8] bg-white p-6">
        <p className="font-mono text-sm font-bold">Combined verdict</p>
        <p className={`mt-1 font-serif text-3xl font-black ${verdict === 'Ready to push' ? 'text-[#1d4d2e]' : 'text-[#b45309]'}`}>{verdict}</p>
        <p className="mt-1 text-sm text-[#6b655c]">
          {highSecrets} HIGH secret(s) found · {highDeps} HIGH-risk major upgrade(s).
          {highSecrets === 0
            ? ' No HIGH secret was found in the pasted/uploaded content.'
            : ' Fix every HIGH secret before pushing.'}
          {' '}This verdict is based on the pasted/uploaded content only — it does not prove a whole repository is clean.
        </p>
      </div>

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-black">1 · Secret scanner</h2>
        <p className="mt-1 text-sm text-[#6b655c]">
          Secret scan runs in your browser. Pasted code is never sent to a server.
          Findings show masked values only — never the full secret.
        </p>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="Paste code or text here…"
          rows={8}
          className="mt-4 w-full border border-[#c9c2b4] bg-white px-4 py-3 font-mono text-sm outline-none focus:border-black"
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="cursor-pointer bg-white px-4 py-2 font-mono text-sm border border-black">
            Upload files
            <input type="file" multiple className="hidden" onChange={(e) => { void onFiles(e.target.files); }} />
          </label>
          <button type="button" onClick={() => setPasted(EXAMPLE_TEXT)} className="bg-white px-4 py-2 font-mono text-sm border border-black">
            Load example (fake key)
          </button>
          {(files.length > 0 || pasted.trim()) && (
            <button type="button" onClick={() => { setFiles([]); setPasted(''); }} className="px-4 py-2 font-mono text-sm underline">
              Clear
            </button>
          )}
        </div>
        {files.length > 0 && (
          <p className="mt-2 font-mono text-xs text-[#8a847a]">Files: {files.map((f) => f.name).join(', ')}</p>
        )}
        {findings.length === 0 ? (
          <p className="mt-4 text-sm text-[#6b655c]">No secrets found in the current input. Paste or upload something to scan.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border border-[#d8d2c8] bg-white text-left text-sm">
              <thead>
                <tr className="border-b border-[#d8d2c8]"><th className="px-3 py-2">File</th><th className="px-3 py-2">Line</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Severity</th><th className="px-3 py-2">Masked value</th><th className="px-3 py-2">Fix</th></tr>
              </thead>
              <tbody>
                {findings.map((f, i) => (
                  <tr key={i} className="border-b border-[#eee9e0]">
                    <td className="px-3 py-2 font-mono text-xs">{f.file}</td>
                    <td className="px-3 py-2">{f.line}</td>
                    <td className="px-3 py-2">{f.type}</td>
                    <td className="px-3 py-2 font-bold">{f.severity}</td>
                    <td className="px-3 py-2 font-mono text-xs">{f.masked}</td>
                    <td className="px-3 py-2">{f.fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={fixedDownloads} className="mt-4 bg-black px-6 py-3 font-mono text-sm text-white">
              Download fixes (fixed files + .env.example + .gitignore)
            </button>
            <p className="mt-2 text-xs text-[#8a847a]">Downloads contain placeholders only — no detected secret value is included.</p>
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-2xl font-black">2 · Dependency checker</h2>
        <p className="mt-1 text-sm text-[#6b655c]">
          Only package names are checked against public registries; your code is not uploaded.
          Patch and minor upgrades are safe; major upgrades are listed separately and are never applied automatically.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <select value={depFileName} onChange={(e) => setDepFileName(e.target.value)} className="border border-[#c9c2b4] bg-white px-3 py-2 font-mono text-sm">
            <option value="requirements.txt">requirements.txt</option>
            <option value="package.json">package.json</option>
          </select>
          <label className="cursor-pointer bg-white px-4 py-2 font-mono text-sm border border-black">
            Upload file
            <input type="file" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setDepFileName(file.name);
              setDepText(await file.text());
            }} />
          </label>
        </div>
        <textarea
          value={depText}
          onChange={(e) => setDepText(e.target.value)}
          placeholder={depFileName.endsWith('.json') ? 'Paste package.json here…' : 'Paste requirements.txt here…\nrequests==2.31.0'}
          rows={8}
          className="mt-3 w-full border border-[#c9c2b4] bg-white px-4 py-3 font-mono text-sm outline-none focus:border-black"
        />
        <button type="button" onClick={() => { void checkDeps(); }} disabled={depLoading || !depText.trim()} className="mt-3 bg-black px-6 py-3 font-mono text-sm text-white disabled:opacity-50">
          {depLoading ? 'Checking registries…' : 'Check dependencies →'}
        </button>
        {depError && <p role="alert" className="mt-4 max-w-3xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">{depError}</p>}
        {depResult && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border border-[#d8d2c8] bg-white text-left text-sm">
              <thead>
                <tr className="border-b border-[#d8d2c8]"><th className="px-3 py-2">Package</th><th className="px-3 py-2">Current</th><th className="px-3 py-2">Latest</th><th className="px-3 py-2">Diff</th><th className="px-3 py-2">Risk</th></tr>
              </thead>
              <tbody>
                {depResult.packages.map((p) => (
                  <tr key={p.name} className="border-b border-[#eee9e0]">
                    <td className="px-3 py-2 font-mono text-xs">{p.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.current ?? 'unspecified'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.latest ?? 'unknown'}</td>
                    <td className="px-3 py-2">{p.diff}</td>
                    <td className="px-3 py-2 font-bold">{p.risk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {depResult.major.length > 0 && (
              <p className="mt-3 text-sm text-[#b45309]">Review separately (major upgrades, not applied): {depResult.major.join(', ')}</p>
            )}
            <button type="button" onClick={downloadUpdatedDeps} className="mt-4 bg-black px-6 py-3 font-mono text-sm text-white">
              Download updated file (safe upgrades only)
            </button>
          </div>
        )}
      </section>
      <p className="mt-10 border-t border-[#d8d2c8] pt-4 text-xs text-[#8a847a]">
        Signals, not guarantees. Source: GitHub API for repo health; PyPI / npm for dependency versions.
      </p>
    </div>
  );
}
