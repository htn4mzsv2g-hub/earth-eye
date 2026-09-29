# Reviewer handoff (temporary)

- **URL:** https://eartheye.us/login
- **Username:** `ee-reviewer`
- **Password:** see `/workspace/atlas-eye/.reviewer-cred.local` on the agent box
  (mode 600, gitignored). Tell Ruben via a secure channel once; do not paste
  the password into git, issues, or chat logs that get archived broadly.
- **Revoke:** `fly secrets unset REVIEWER_USER REVIEWER_PASS -a eartheye` then
  restart/redeploy if needed (see `docs/REVIEWER_ACCESS.md`).
- **Scope:** critique via globe UI only; no Fly secret / billing / owner admin.
