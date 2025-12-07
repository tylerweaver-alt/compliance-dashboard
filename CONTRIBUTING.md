# Contributing to Compliance Dashboard

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- Access to a Neon Postgres database (or local Postgres for development)
- Google OAuth credentials (for authentication testing)

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/compliance-dashboard.git
   cd compliance-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Create a `.env.local` file with required variables:
   ```env
   DATABASE_URL=your_neon_connection_string
   NEXTAUTH_SECRET=your_random_secret
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open** [http://localhost:3000](http://localhost:3000) in your browser.

## Development Workflow

### Before Opening a Pull Request

All PRs must pass these checks:

1. **Lint** - Code must pass ESLint
   ```bash
   npm run lint
   ```

2. **Build** - Production build must succeed
   ```bash
   npm run build
   ```

3. **Tests** - All tests must pass
   ```bash
   npm test
   ```

4. **Format** - Code should be consistently formatted
   ```bash
   npm run format
   ```

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes following the coding standards below
3. Ensure all checks pass locally
4. Open a PR with a clear description of changes
5. Address any review feedback
6. PRs require approval from code owners before merging

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode (already configured in `tsconfig.json`)
- Define explicit types for function parameters and return values
- Avoid `any` type where possible

### Code Style

- Follow the ESLint configuration (extends `next/core-web-vitals` and `next/typescript`)
- Use Prettier for consistent formatting
- Use meaningful variable and function names
- Add comments for complex logic

### File Organization

- React components go in `app/components/`
- API routes go in `app/api/<resource>/route.ts`
- Shared utilities go in `lib/`
- Type definitions go in `types/`

### Database

- Use parameterized queries only (via `lib/db.ts`)
- Never concatenate user input into SQL strings
- Document any new tables or columns in `docs/DATA_MODEL.md`

## Security Requirements

### Mandatory

- **No hardcoded secrets** - All credentials must use environment variables
- **No PII/PHI in commits** - Never commit real patient or personal data
- **Input validation** - Validate all user inputs, especially file uploads
- **SQL injection prevention** - Use only parameterized queries

### Recommended

- Add audit logging for sensitive operations
- Consider rate limiting for public-facing endpoints
- Test for common vulnerabilities (XSS, CSRF)

## Questions or Issues?

- Open a GitHub issue for bugs or feature requests
- For security issues, see [SECURITY.md](./SECURITY.md)
- Contact the maintainers for other questions

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).

