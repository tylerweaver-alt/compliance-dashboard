import * as Sentry from '@sentry/nextjs';

/**
 * Required environment variables for production.
 * Missing any of these in production should fail startup.
 */
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
];

/**
 * Environment variables that should be present in production but warn if missing.
 */
const RECOMMENDED_ENV_VARS = [
  'CRON_SECRET',
  'SENTRY_DSN',
  'SYSADMIN_IP_ALLOWLIST',
];

/**
 * Validate environment variables on startup.
 * In production, missing required vars will fail startup.
 */
function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const vercelEnv = process.env.VERCEL_ENV;
  const isProductionDeployment = isProduction || vercelEnv === 'production';

  // Check required environment variables
  const missingRequired: string[] = [];
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missingRequired.push(varName);
    }
  }

  if (missingRequired.length > 0) {
    const msg = `🚨 Missing required env vars: ${missingRequired.join(', ')}`;
    console.error(msg);
    if (isProductionDeployment) {
      throw new Error(msg);
    }
  }

  // Check recommended environment variables (warn only)
  const missingRecommended: string[] = [];
  for (const varName of RECOMMENDED_ENV_VARS) {
    if (!process.env[varName]) {
      missingRecommended.push(varName);
    }
  }

  if (missingRecommended.length > 0) {
    console.warn(`⚠️ Recommended env vars missing: ${missingRecommended.join(', ')}`);
  }

  // CRON_SECRET is required in production for secure cron jobs
  if (isProductionDeployment && !process.env.CRON_SECRET) {
    console.error('🚨 CRON_SECRET is not set - cron jobs will fail in production');
  }

  console.log('✅ Environment validation passed');
}

export async function register() {
  // Validate environment on startup
  validateEnvironment();

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
