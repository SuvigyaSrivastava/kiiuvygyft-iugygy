# Submission checklist

Done by the build (checked by running it):
- [x] Backend tests pass: 72
- [x] Front-end typecheck, tests (14) and build pass
- [x] ruff and mypy pass
- [x] Docker image builds, starts, serves the app and API, runs as non-root, health check reports healthy
- [x] Vercel entry point imports and serves all main endpoints locally
- [x] Receipt verify script accepts a fresh receipt and rejects a changed one
- [x] README, decisions, data notes, video scripts and run sheet written

Left for you to do by hand:
- [ ] Pick a random-string repo name (not the company name, not the project name). Example: `python -c "import secrets,string;print(''.join(secrets.choice(string.ascii_lowercase) for _ in range(8)))"`
- [ ] Confirm the name with me before creating the repo. Nothing has been pushed.
- [ ] Create the public GitHub repo and push. Check the repo has no personal name in the commit author that you do not want public: `git log --format='%an %ae' | sort -u`
- [ ] Check no secrets are in the repo: `git grep -nIE "(api[_-]?key|secret|token)" -- . ':!docs' ':!*.lock'`
- [ ] Wait for CI to go green on the first push
- [ ] Deploy: `npm i -g vercel`, `vercel login`, `vercel --prod` from the repo root. Add `GIT_COMMIT` as an environment variable only if Vercel does not provide the commit sha.
- [ ] Paste the live URL into the README (top line) and push again
- [ ] Open the live app in an incognito window. It must show data on every tab with no errors
- [ ] Open `LIVE/api/health`, `LIVE/api/meta` and `LIVE/docs` in incognito
- [ ] Time a first request after idle. If it takes more than about 10 seconds, load the page once before recording
- [ ] Edit the "AI tools used" paragraph in the README so it says exactly what you did yourself
- [ ] Record the video (two parts, under 10 minutes in total), upload to YouTube as Unlisted
- [ ] Open the YouTube link in incognito and check it plays
- [ ] Fill in the submission form with the repo, the live app and the video links
