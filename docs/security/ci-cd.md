# CI/CD Security Configuration

This document outlines the CI/CD security configuration for the Acadian Compliance Dashboard.

## GitHub Actions Workflows

### Main CI Workflow (`.github/workflows/ci.yml`)

**Triggers:**

- Push to `main` or `pre-production` branches
- Pull requests to `main` or `pre-production`

**Jobs:**

| Job              | Purpose                       | Required |
| ---------------- | ----------------------------- | -------- |
| `lint-and-build` | ESLint, tests, build          | ✅ Yes   |
| `security-audit` | npm audit for vulnerabilities | ⚠️ Warns |
| `typecheck`      | TypeScript strict checking    | ✅ Yes   |
| `sql-audit`      | Custom SQL injection scan     | ✅ Yes   |

### CodeQL Analysis (`.github/workflows/codeql.yml`)

Automated code scanning for security vulnerabilities:

- JavaScript/TypeScript analysis
- Runs on push to main and PRs
- Integrated with GitHub Security tab

### Dependabot (`.github/dependabot.yml`)

Automated dependency updates:

- npm packages: Weekly updates
- GitHub Actions: Weekly updates
- Auto-creates PRs for security updates

## Branch Protection Rules

Configure in GitHub Settings → Branches → Add rule for `main`:

### Required Settings

| Setting                             | Value | Reason                   |
| ----------------------------------- | ----- | ------------------------ |
| Require pull request before merging | ✅    | No direct pushes to main |
| Require approvals                   | 1+    | Code review requirement  |
| Dismiss stale reviews               | ✅    | Re-review after changes  |
| Require status checks to pass       | ✅    | CI must pass             |
| Require branches to be up to date   | ✅    | Prevent merge conflicts  |
| Include administrators              | ✅    | No bypass for admins     |

### Required Status Checks

Select these as required:

- `lint-and-build`
- `typecheck`
- `sql-audit`
- `CodeQL` (if enabled)

### Additional Protections

| Setting                | Value                  |
| ---------------------- | ---------------------- |
| Require signed commits | Optional (recommended) |
| Require linear history | Optional               |
| Allow force pushes     | ❌ Never               |
| Allow deletions        | ❌ Never               |

## Environment Secrets

### Required Repository Secrets

Configure in GitHub Settings → Secrets → Actions:

| Secret              | Purpose                  | Required For |
| ------------------- | ------------------------ | ------------ |
| `DATABASE_URL`      | Neon database connection | Build        |
| `NEXTAUTH_SECRET`   | Session encryption       | Build        |
| `VERCEL_TOKEN`      | Deployment automation    | Deploy       |
| `VERCEL_ORG_ID`     | Vercel organization      | Deploy       |
| `VERCEL_PROJECT_ID` | Vercel project           | Deploy       |

### Secret Rotation

| Secret            | Rotation Frequency |
| ----------------- | ------------------ |
| `NEXTAUTH_SECRET` | Quarterly          |
| `DATABASE_URL`    | On compromise      |
| API keys          | Annually           |

## Workflow Security Best Practices

### 1. Pin Action Versions

```yaml
# ✅ Good - pinned to specific version
uses: actions/checkout@v4

# ❌ Bad - unpinned
uses: actions/checkout@main
```

### 2. Minimal Permissions

```yaml
# Set minimal permissions for the workflow
permissions:
  contents: read
  pull-requests: read
```

### 3. Secret Handling

```yaml
# ✅ Good - use secrets context
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}

# ❌ Bad - hardcoded values
env:
  DATABASE_URL: "postgresql://user:pass@host/db"
```

### 4. Concurrency Control

```yaml
# Prevent parallel runs that could conflict
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

## Adding New CI Checks

When adding new CI jobs:

1. Create the job in `.github/workflows/ci.yml`
2. Test locally with `act` or in a feature branch
3. Add to required status checks after verification
4. Document in this file

## Monitoring CI Security

### GitHub Security Tab

Check regularly for:

- Dependabot alerts
- CodeQL findings
- Secret scanning alerts

### Failed Audits

When `npm audit` fails with high severity:

1. Review the vulnerability
2. Check if it affects production
3. Update dependency if safe
4. Document if suppressing

## Deployment Pipeline

```
PR Created → CI Runs → Review Required → Merge to main
                                              ↓
                                    Vercel Preview Deploy
                                              ↓
                                    Production Deploy (auto)
```

## Related Documents

- [SECURITY.md](../SECURITY.md) - Security architecture
- [DEPLOYMENT.md](../DEPLOYMENT.md) - Deployment procedures
- [INCIDENT_RESPONSE.md](../INCIDENT_RESPONSE.md) - If CI detects breach
