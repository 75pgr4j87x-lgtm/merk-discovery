# Development and production branches

- `betadesk`: BetaDesk feature work.
- `customer-operations`: Customer Operations feature work.
- `dev`: integrated application for testing both features inside Studio.
- `main`: production, promoted only after the owner's explicit final approval.

Feature branches start from the complete working application. They separate development history, not runtime features; both modules share Studio authentication and must remain present in the integrated build.

A push to either feature branch runs `.github/workflows/integrate-dev.yml`. The workflow merges the pushed commit into current `dev`, checks types, runs application tests, and builds the preview before pushing the merge to `dev`. Conflicts or failed checks stop integration. Pushes are serialized, and non-fast-forward pushes fail rather than overwrite newer work. GitHub Actions needs write access to repository contents. Vercel's existing Git integration handles the resulting dev deployment; confirm its deployment status before calling it live.

Use https://merk-discoveryflow-git-dev-merk3.vercel.app/studio for development testing. Deployment-specific feature preview URLs are not testing entry points. Vercel's production branch is `main`.

Before feature work, merge the latest `origin/dev` into the feature branch. After testing on dev, prepare a pull request from `dev` to `main`. Wait for the owner's explicit final approval before merging. No workflow in this repository merges into main.

GitHub branch protection could not be configured with this session's integration credentials (HTTP 403). The repository owner should require pull requests and approval on `main`, block force pushes/deletion, and disable bypass where appropriate. Until configured, the final-approval rule is a documented process, not an enforced GitHub restriction.
