# Campaign State (cms_campaign_state) — End-to-End Trace

This document traces **all scenarios** where `cms_campaign_state.status` is read or written, so you can reason about when the UI/DB can show an inaccurate status (e.g. "Stopped" while the loop is still running).

**No code changes** — trace only.

---

## 1. Where status is stored and what it means

- **Table:** `cms_campaign_state` (one row per campaign).
- **Column:** `status` — allowed values: `'idle' | 'running' | 'paused' | 'stopped' | 'scheduled' | 'completed'`.
- **Source of truth for “is the loop actually running?”:** In-memory dict `_tasks` in `auto_run_service.py` (campaign_id → asyncio Task). If the task exists and is not done, the loop is running. The DB is **derived** from loop life cycle and API actions; it can get out of sync in several scenarios below.

---

## 2. All writers of `cms_campaign_state.status`

Every place that sets status (via `repo.set_status(...)` or direct `state.status = ...`) is listed below with **file:line**, **condition**, and **effect**.

| # | File | Line(s) | When it runs | Status set |
|---|-----|--------|----------------|------------|
| **A** | `backend/service/auto_run_service.py` | 135 | Inside `_wait_for_time_window`: current IST time is **inside** the run window (`start_t <= cur_time < end_t`) | `'running'` |
| **B** | `backend/service/auto_run_service.py` | 177 | Inside `_wait_for_time_window`: current time is **outside** the window and state was not already `'scheduled'` | `'scheduled'` |
| **C** | `backend/service/auto_run_service.py` | 421 | Start of `_run_loop` (after loop starts) | `'running'` |
| **D** | `backend/service/auto_run_service.py` | 450 | In `_run_loop`: all chunks were **already** finished before iterating (start_index >= total) | `'completed'` |
| **E** | `backend/service/auto_run_service.py` | 536 | In `_run_loop`: normal completion (all chunks processed) | `'completed'` |
| **F** | `backend/service/auto_run_service.py` | 551 | In `_run_loop`: user clicked Stop → `_StoppedByUser` caught | `'stopped'` |
| **G** | `backend/service/auto_run_service.py` | 583 | In `_run_loop`: any **other** exception caught | `'stopped'` |
| **H** | `backend/service/auto_run_service.py` | 717 | `stop(campaign_id, db)`: user requested stop; sets status **immediately** so UI updates | `'stopped'` |
| **I** | `backend/service/auto_run_service.py` | 740 | `pause(campaign_id, db)`: user requested pause | `'paused'` |
| **J** | `backend/service/auto_run_service.py` | 778 | `resume(campaign_id, db)`: state was `'paused'` but **no live task** (e.g. server restarted while paused) | `'stopped'` |
| **K** | `backend/service/auto_run_service.py` | 783 | `resume(campaign_id, db)`: user requested resume (task is alive) | `'running'` |
| **L** | `backend/service/auto_run_service.py` | 845 | `get_status(campaign_id, db)`: **auto-heal** — DB has `'running'` or `'paused'` but **no live task** for this campaign | `'stopped'` |
| **M** | `backend/service/auto_run_service.py` | 937 | `get_monitor_data(client_id, db)`: **auto-heal** — same condition as L, per campaign in the grid | `'stopped'` |
| **N** | `backend/repo/auto_run_repo.py` | 61, 75 | `upsert_state(...)`: when **start()** is called (create or reset state row) | `'idle'` |
| **O** | `backend/database/sync_campaign_state_from_campaign.py` | 93 | **Manual script**: syncs state from `cms_campaign.status` (Millis). Maps e.g. `started`/`running` → `'stopped'`, `finished` → `'completed'`, else → `'idle'` | overwrites with mapped value |

**Notes:**

- **A, B:** Time-window logic. While the loop is sleeping outside the window, status is `'scheduled'`; when the window opens, it’s set back to `'running'` (A).
- **C, E, F, G:** Only the **process that runs `_run_loop`** performs C, E, F, G. Other processes never see that task.
- **L, M:** **Read-heavy paths** that **mutate** the DB: any call to `GET /auto-run/status/{campaign_id}` or `GET /auto-run/monitor/{client_id}` can set status to `'stopped'` if that process thinks there is no live task.

---

## 3. Who calls the status/monitor endpoints (readers that can trigger writes)

| Caller | Endpoint | Frequency | Effect if “auto-heal” runs |
|--------|----------|-----------|----------------------------|
| Frontend (Campaign Management / status UI) | `GET /auto-run/status/{campaign_id}` | On open / poll | If this request is handled by a **different worker** than the one running the loop, that worker sees no task → sets status to `'stopped'` (L). |
| Frontend (Monitor tab) | `GET /auto-run/monitor/{client_id}` | **Every 5 seconds** (see `CampaignMonitor.tsx` ~695) | Same as above: if the request hits a worker that doesn’t have the loop’s task, it sets that campaign’s status to `'stopped'` (M). |

So: **every 5 seconds** the Monitor tab can trigger a write to `cms_campaign_state` for every campaign that the **current request’s worker** believes is “stale” (status `running`/`paused` but no task in **that** worker’s `_tasks`).

---

## 4. In-memory state is per process

- `_tasks`, `_flags`, `_time_windows` in `auto_run_service.py` are **module-level dicts**.
- They are **not** shared across processes.
- If the app runs with **multiple workers** (e.g. `uvicorn main:app --workers 2` or Gunicorn with multiple workers):
  - Worker 1 may run the loop for campaign X (has `_tasks[campaign_id]`).
  - Worker 2 handles the next Monitor poll (or a status poll). Worker 2’s `_tasks` does **not** contain campaign X → `is_running(campaign_id)` is False → auto-heal runs → **status set to `'stopped'`** in the DB.
  - The loop on Worker 1 is still running and never re-sets status to `'running'` (it only set it once at loop start C and after window open A). So the DB stays `'stopped'` while the loop continues.

This is the **most likely** cause of “it was Running, then showed Stopped but the loop was still running.”

---

## 5. Scenario-by-scenario summary

### 5.1 Normal flow (single worker)

1. **Start:** `start()` → `upsert_state` (status `'idle'`) → task created → `_run_loop` runs → `set_status(..., 'running')` (C). UI shows Running.
2. **Time window:** If outside window, `_wait_for_time_window` sets `'scheduled'` (B). When window opens, sets `'running'` (A). UI shows Scheduled then Running.
3. **User stop:** `stop()` sets `'stopped'` (H); loop sees flag and exits, then `_StoppedByUser` sets `'stopped'` again (F). UI shows Stopped.
4. **User pause:** `pause()` sets `'paused'` (I). Loop keeps running but waits in `_check_flag`. UI shows Paused.
5. **User resume:** `resume()` sets `'running'` (K). UI shows Running.
6. **Completion:** Loop sets `'completed'` (E or D). UI shows Completed.
7. **Exception in loop:** Loop sets `'stopped'` (G). UI shows Stopped.

With a **single** worker, any call to `get_status` or `get_monitor_data` sees the same `_tasks` as the loop, so auto-heal (L, M) does not run for an actually running campaign.

### 5.2 Multi-worker (no shared memory)

- **Loop runs on Worker A.** Status was set to `'running'` (C) or (A) on Worker A.
- **Monitor (or status) request is handled by Worker B.** Worker B’s `is_running(campaign_id)` is False → auto-heal (L or M) runs → **status set to `'stopped'`** in DB.
- **Worker A’s loop never touches status again** until it exits (F, G, E, D) or hits time window (B then A). So the DB can stay `'stopped'` while the loop is still running on Worker A.
- **Result:** UI shows Stopped; backend is still processing. Matches user report: “first it was Running … after some time it showed stopped but the loop was running.”

### 5.3 Server restart while “running” or “paused”

- After restart, `_tasks` is empty. Next `get_status` or `get_monitor_data` sees status `'running'` or `'paused'` and no task → auto-heal sets `'stopped'`. Correct: there is no loop anymore.

### 5.4 Resume after server restart (paused)

- User had paused; then server restarted. State in DB is still `'paused'`, but there is no task. `resume()` checks `is_running()` → False → sets status to `'stopped'` (J) and returns an error. Correct.

### 5.5 Manual script: `sync_campaign_state_from_campaign.py`

- Script overwrites **every** row’s `status` (and `total_chunks`) from `cms_campaign` (Millis).
- Mapping: `finished`/`completed` → `'completed'`, `started`/`running` → `'stopped'`, else → `'idle'`.
- If the **auto-run loop is running** and someone runs this script, it will set that campaign’s state to `'stopped'` (or `'idle'`) even though the loop is still running. So: **running the sync script while auto-run is active can make the state inaccurate.**

### 5.6 Backfill / migrations

- `backfill_campaign_state.py` only **inserts** new rows with `status='idle'` for campaigns that don’t have a state row. It does not overwrite existing status. So it doesn’t cause “running → stopped” by itself.

### 5.7 Order of operations at start

- `start()` calls `repo.upsert_state()` (status `'idle'`) then creates the task. So there is a short window where DB can be `'idle'` while the task is starting. Then `_run_loop` sets `'running'` (C). If something called `get_status`/`get_monitor_data` in that window (and auto-heal applied), it could in theory set `'stopped'` because the task might not be registered yet — but in practice the task is put in `_tasks` before `_run_loop` does the first await, so this is a very small race.

---

## 6. Summary: why “Running” can turn into “Stopped” while the loop still runs

| Cause | Explanation |
|-------|-------------|
| **Multiple workers** | Monitor (or status) is served by a worker that doesn’t run the loop. That worker sees no task → auto-heal sets `'stopped'`. Loop on the other worker keeps running and doesn’t overwrite status again. |
| **Sync script** | Someone runs `sync_campaign_state_from_campaign.py` while the loop is running; script overwrites status from Millis (e.g. `started` → `'stopped'`). |
| **Restart** | Not applicable to “loop still running” — after restart there is no loop. |

No code was changed in this trace; the above is a full map of how campaign state is updated and where inaccuracies can come from end to end.
