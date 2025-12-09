# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in this project, please report it responsibly.

### How to Report

1. **Do NOT open a public GitHub issue** for security vulnerabilities.
2. Email your findings to: **tylerkweaver20@gmail.com** 
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

### What to Expect

- **Initial Response**: We aim to acknowledge receipt within **2 business days**.
- **Assessment**: We will investigate and assess the vulnerability within **5 business days**.
- **Resolution**: We will work to resolve confirmed vulnerabilities promptly, typically within **30 days** depending on complexity.
- **Disclosure**: We will coordinate with you on public disclosure timing after a fix is available.

## Security Measures

This application implements the following security practices:

### Authentication & Authorization
- NextAuth.js with Google OAuth provider for all user authentication
- Session-based authentication with JWT tokens encrypted via `NEXTAUTH_SECRET`
- Middleware-enforced route protection for all API and page routes
- Role-based access control (RBAC) for administrative functions

### API Security
- All API routes (except `/api/auth/*`, `/api/health`, and `/api/cron/*`) require valid authentication
- Cron endpoints use separate `CRON_SECRET` verification
- Input validation on upload endpoints (file type, size limits)
- Parameterized SQL queries to prevent SQL injection

### Secrets Management
- All secrets and API keys are managed via environment variables
- No credentials are committed to the repository
- `.env*` files are excluded via `.gitignore`

### CI/CD Security
- CodeQL static analysis on all pull requests and pushes to main
- Dependabot enabled for automated security updates
- Branch protection rules require passing CI checks

### Data Protection
- SSL/TLS encryption for database connections
- No raw data files stored in the repository
- Audit logging for sensitive operations

## Security Best Practices for Contributors

1. **Never commit secrets** - Use environment variables for all credentials
2. **No PII/PHI in code** - Do not include real patient or personal data in commits
3. **Validate all inputs** - Especially for file uploads and user-provided data
4. **Use parameterized queries** - Never concatenate user input into SQL strings
5. **Keep dependencies updated** - Review Dependabot PRs promptly

## Related Documentation

- [docs/SECURITY.md](./docs/SECURITY.md) - Detailed application security architecture
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) - System architecture overview

