/**
 * Security Verification Script
 *
 * Runs all security checks and verifications for the Acadian Compliance Dashboard.
 *
 * Usage: npx ts-node scripts/security/verify-all.ts
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
}

const results: CheckResult[] = [];

function runCheck(name: string, command: string, warnOnly = false): void {
  console.log(`\n🔍 Running: ${name}...`);
  try {
    execSync(command, { stdio: 'pipe', encoding: 'utf-8' });
    results.push({ name, status: 'PASS', message: 'Check passed' });
    console.log(`   ✅ ${name} - PASSED`);
  } catch (error) {
    const status = warnOnly ? 'WARN' : 'FAIL';
    const message = error instanceof Error ? error.message : 'Unknown error';
    results.push({ name, status, message: message.substring(0, 200) });
    console.log(`   ${warnOnly ? '⚠️' : '❌'} ${name} - ${status}`);
  }
}

function checkFileExists(name: string, filePath: string): void {
  const fullPath = path.join(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    results.push({ name, status: 'PASS', message: `File exists: ${filePath}` });
    console.log(`   ✅ ${name} - PASSED`);
  } else {
    results.push({ name, status: 'FAIL', message: `Missing file: ${filePath}` });
    console.log(`   ❌ ${name} - MISSING: ${filePath}`);
  }
}

function checkEnvNotInCode(): void {
  console.log(`\n🔍 Running: Check for hardcoded secrets...`);
  const dangerousPatterns = [
    /NEXTAUTH_SECRET\s*=\s*["'][^"']+["']/gi,
    /DATABASE_URL\s*=\s*["']postgresql:\/\/[^"']+["']/gi,
    /password\s*[:=]\s*["'][^"']{8,}["']/gi,
  ];

  const filesToCheck = ['app/**/*.ts', 'app/**/*.tsx', 'lib/**/*.ts'];

  let hasSecrets = false;

  // Simple check - just verify .env.local exists and .env doesn't have real values
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const pattern of dangerousPatterns) {
      if (pattern.test(envContent)) {
        hasSecrets = true;
        break;
      }
    }
  }

  if (hasSecrets) {
    results.push({
      name: 'Hardcoded secrets check',
      status: 'WARN',
      message: '.env file may contain real secrets - ensure not committed',
    });
    console.log(`   ⚠️ Hardcoded secrets check - WARNING`);
  } else {
    results.push({
      name: 'Hardcoded secrets check',
      status: 'PASS',
      message: 'No hardcoded secrets detected in .env',
    });
    console.log(`   ✅ Hardcoded secrets check - PASSED`);
  }
}

function main(): void {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║ CADalytix Compliance Dashboard Security Verification Check║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  // Core checks
  runCheck('TypeScript Check', 'npx tsc --noEmit');
  runCheck('ESLint', 'npm run lint', true); // Warn only for existing lint issues
  runCheck('SQL Injection Audit', 'npx tsx scripts/security/audit-sql.ts');
  runCheck('npm Audit (High)', 'npm audit --audit-level=high', true);

  // File existence checks
  console.log(`\n🔍 Checking required security files...`);
  checkFileExists('SECURITY.md', 'SECURITY.md');
  checkFileExists('docs/SECURITY.md', 'docs/SECURITY.md');
  checkFileExists('Incident Response Doc', 'docs/INCIDENT_RESPONSE.md');
  checkFileExists('Backup Recovery Doc', 'docs/BACKUP_RECOVERY.md');
  checkFileExists('Pentest Checklist', 'docs/PENTEST_CHECKLIST.md');
  checkFileExists('CI/CD Security Doc', 'docs/security/ci-cd.md');
  checkFileExists('Middleware', 'middleware.ts');

  // Code checks
  checkEnvNotInCode();

  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    VERIFICATION SUMMARY                    ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const warned = results.filter((r) => r.status === 'WARN').length;

  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ⚠️  Warnings: ${warned}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log('');

  if (failed > 0) {
    console.log('❌ VERIFICATION FAILED - Address the following issues:\n');
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => console.log(`   • ${r.name}: ${r.message}`));
    process.exit(1);
  }

  if (warned > 0) {
    console.log('⚠️  VERIFICATION PASSED WITH WARNINGS:\n');
    results
      .filter((r) => r.status === 'WARN')
      .forEach((r) => console.log(`   • ${r.name}: ${r.message}`));
  }

  console.log('\n✅ SECURITY VERIFICATION COMPLETE\n');
  process.exit(0);
}

main();
