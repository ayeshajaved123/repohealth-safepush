# RepoHealth + SafePush — 60-second demo script

Total: about 60 seconds. Everything shown comes from live data; do not quote scores from memory — read them off the screen.

## 0:00 — Inspect (20 seconds)

Open http://localhost:5173. The app opens directly on Inspect, no sign-in, no landing page.
Type `ayeshajaved123/hostelhub` and press "Inspect repo". Read the total score off the screen
(it was 48/100 in earlier live checks, but the number on screen is the one that counts),
then one category reason and one Next fix.

## 0:20 — SafePush: secrets (20 seconds)

Open "SafePush" in the top nav. Click "Load example (fake key)" and point out the finding:
type, severity, and masked value only — the full key is never shown. Click "Download fixes"
and name what it gives: fixed files, `.env.example`, and `.gitignore`. Say it out loud:
"Secret scan runs in your browser. Pasted code is never sent to a server."

## 0:40 — SafePush: dependencies (20 seconds)

In the dependency section, paste a real dependency file (for example your own
`requirements.txt` or `package.json`) and press "Check dependencies". Read one row:
current vs latest, diff, and risk. Point out that patch/minor upgrades are safe,
major upgrades are listed separately and are never applied automatically.
Download the updated file to close.

## Close (one line)

"RepoHealth scores a repo live and explains every point — and SafePush checks it
before you push, so a leaked key or a breaking dependency never reaches GitHub."
