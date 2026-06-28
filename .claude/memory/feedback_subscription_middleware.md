---
name: feedback-subscription-middleware
description: "Never open DB connections in per-request middleware — embed data in JWT instead"
metadata:
  type: feedback
---

The original subscription middleware opened a new master DB session on every authenticated request to check `trial_ends_at` and `plan`. Under concurrent load, this exhausted the connection pool, causing requests to fail silently with no response → browser sees CORS errors (ERR_FAILED, no Access-Control-Allow-Origin).

**Why:** SQLAlchemy's connection pool has a fixed size (pool_size + max_overflow). Opening new sessions in middleware on every request competes with route handler sessions.

**How to apply:** Embed per-request context (plan, trial_ends_at, company config) in the JWT at login time. Middleware reads from `request.state.user` (already parsed JWT claims) — zero DB queries, zero connections. This pattern should be used for any middleware that needs company-level data.

Current implementation: `plan` and `trial_ends_at` are JWT claims set at login in `routes/auth.py`, read in `middleware/subscription.py`.
