
## L4c.1. Follow-ups from the 4c round-2 gates (open, devops-cicd)

- Residuals to add to the gate-check.sh header: any GitHub App installed on the repo with checks/statuses write, or
  any other account with write access, can post `merge-gate` (only 4c-app closes it); a stored owner PAT in a
  workflow could add the label as the owner ("post a check or add the label").
- Hardening: the spoof-check greps decide on output only; also require grep's exit status <= 1.
- A 12 MB single-line file ending in an invalid byte keeps the UTF-8 grep busy for a long time (CI's 5-minute job
  timeout keeps merge-gate red, but without a reason line): cap the blob size and fail with a reason.
- Comment nits: the B2 fact comment still says "checks/statuses"; the owner filter assumes a user-owned repo — the 4i
  template / 4c-app needs an approver-login input for organization-owned repos.
