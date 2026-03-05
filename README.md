# TeamLeadKit

A local dashboard that connects to Orange Logic Link to give you visibility into your team's workload, task progress, and completed work — without waiting for anyone to set it up for you. Super fast compare to Link because we're only working on indexed data.

## What You Get

- **Work view** — monitor tasks in hierarchy, Kanban, Gantt, burndown, and participant breakdown views
- **Team view** — see incomplete and completed tasks across all team members with charts and filters

Everything runs on your machine. No Docker, no database servers, no DevOps required.

## Setup

You need **Node.js** (>= 18) and **Python** (3.11+).

If you use pyenv, the repo will auto-select the right Python version. If you don't have it:

```bash
pyenv install 3.11.9
```

### 1. Start the backend

```bash
cd backend
make setup   # first time only — creates virtual env, installs dependencies
make run     # starts the server on port 8000
```

### 2. Start the frontend

```bash
cd frontend
npm install   # first time only
npm run dev   # opens on port 3000
```

### 3. Set your Link API token

Open [http://localhost:3000](http://localhost:3000), click the **gear icon** (top-left), then **Set Link Auth Token** and paste your Orange Logic token. It stays in memory and expires after 24 hours — you'll need to re-enter it the next day.

## Notes

- Task data fetched from Link is cached locally in a SQLite file (`backend/data/teamleadkit.db`). This means pages load instantly after the first fetch.
- The team member list is configured in `backend/app/classes/work/team.py`. Update it if your team changes.
