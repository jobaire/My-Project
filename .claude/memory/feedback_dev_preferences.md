---
name: feedback-dev-preferences
description: "User prefers to execute changes immediately without being asked for approval on straightforward fixes"
metadata:
  type: feedback
---

User says "please do these by yourself" or "go ahead" — prefers direct execution without extra confirmation prompts for clear, unambiguous tasks.

**Why:** User is a beginner-friendly developer who wants to move fast. Stopping to confirm every step slows them down.

**How to apply:** For tasks that are clearly scoped and reversible (code edits, SQL migrations, config changes), execute directly. Only pause for decisions that require user input (e.g. what email address to use, which password to set, external service setup that requires their credentials).
