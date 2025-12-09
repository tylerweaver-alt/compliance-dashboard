/**
 * SQL Security Audit Script
 *
 * Scans the codebase for potential SQL injection vulnerabilities by detecting:
 * - String concatenation in SQL queries
 * - Template literals without sql`` tag
 * - Direct variable interpolation in queries
 *
 * Usage: npx ts-node scripts/security/audit-sql.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface Finding {
  file: string;
  line: number;
  type: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
  code: string;
}

const findings: Finding[] = [];

// Patterns to detect potential SQL injection vulnerabilities
const patterns = [
  {
    // String concatenation in SQL context (actual injection risk)
    regex:
      /["']SELECT.*["']\s*\+\s*[a-zA-Z]|["']INSERT.*["']\s*\+\s*[a-zA-Z]|["']UPDATE.*["']\s*\+\s*[a-zA-Z]|["']DELETE.*["']\s*\+\s*[a-zA-Z]/gi,
    type: 'CRITICAL' as const,
    message: 'Potential SQL injection: string concatenation with variable in SQL query',
  },
  {
    // Template literal with variable interpolation that's NOT parameterized ($1, $2 patterns)
    // This looks for ${...} in SQL that is NOT followed by a parameterized array
    regex: /`[^`]*(SELECT|INSERT|UPDATE|DELETE)[^`]*\$\{[^}]+\}[^`]*`\s*[^,\]]/gi,
    type: 'WARNING' as const,
    message: 'Potential unsafe query: template literal with variable - verify parameterization',
  },
  {
    // eval or Function constructor (general security issue)
    regex: /\beval\s*\(|\bnew\s+Function\s*\(/gi,
    type: 'CRITICAL' as const,
    message: 'Dangerous function detected: eval or Function constructor',
  },
  {
    // Raw user input passed directly to query without sanitization
    regex: /query\s*\([^)]*req\.(query|body|params)\.[^)]+\)/gi,
    type: 'CRITICAL' as const,
    message: 'Potential SQL injection: request data passed directly to query',
  },
];

// Files/directories to skip
const skipPaths = [
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  '.vercel',
  'scripts/security/audit-sql.ts', // Skip self
];

// File extensions to scan
const scanExtensions = ['.ts', '.tsx', '.js', '.jsx'];

function shouldScan(filePath: string): boolean {
  const relativePath = path.relative(process.cwd(), filePath);
  if (skipPaths.some((skip) => relativePath.startsWith(skip))) {
    return false;
  }
  return scanExtensions.includes(path.extname(filePath));
}

function scanFile(filePath: string): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    patterns.forEach((pattern) => {
      if (pattern.regex.test(line)) {
        findings.push({
          file: path.relative(process.cwd(), filePath),
          line: index + 1,
          type: pattern.type,
          message: pattern.message,
          code: line.trim().substring(0, 100),
        });
      }
      // Reset regex lastIndex for global patterns
      pattern.regex.lastIndex = 0;
    });
  });
}

function scanDirectory(dir: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!skipPaths.some((skip) => entry.name === skip)) {
        scanDirectory(fullPath);
      }
    } else if (entry.isFile() && shouldScan(fullPath)) {
      scanFile(fullPath);
    }
  }
}

function main(): void {
  console.log('🔍 SQL Security Audit Starting...\n');

  const startDir = process.cwd();
  scanDirectory(startDir);

  if (findings.length === 0) {
    console.log('✅ No SQL injection vulnerabilities detected!\n');
    process.exit(0);
  }

  // Group by severity
  const critical = findings.filter((f) => f.type === 'CRITICAL');
  const warnings = findings.filter((f) => f.type === 'WARNING');
  const info = findings.filter((f) => f.type === 'INFO');

  console.log('📊 Security Audit Results:\n');
  console.log(`   🔴 Critical: ${critical.length}`);
  console.log(`   🟡 Warnings: ${warnings.length}`);
  console.log(`   🔵 Info: ${info.length}\n`);

  if (critical.length > 0) {
    console.log('🔴 CRITICAL FINDINGS:\n');
    critical.forEach((f) => {
      console.log(`   ${f.file}:${f.line}`);
      console.log(`   Message: ${f.message}`);
      console.log(`   Code: ${f.code}\n`);
    });
  }

  if (warnings.length > 0) {
    console.log('🟡 WARNINGS:\n');
    warnings.forEach((f) => {
      console.log(`   ${f.file}:${f.line}`);
      console.log(`   Message: ${f.message}`);
      console.log(`   Code: ${f.code}\n`);
    });
  }

  // Exit with error if critical findings
  if (critical.length > 0) {
    console.log('❌ Audit FAILED: Critical vulnerabilities found!');
    process.exit(1);
  }

  console.log('⚠️  Audit passed with warnings. Please review.');
  process.exit(0);
}

main();
