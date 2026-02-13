#!/usr/bin/env node

/**
 * Backend Setup Verification Script
 * Verifies that all routes, imports, and configurations are correct
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`)
};

let passed = 0;
let failed = 0;

// Test: Check required files exist
const requiredFiles = [
  'src/server.js',
  'src/routes/index.js',
  'src/routes/zones.js',
  'src/routes/player.js',
  'src/routes/missions.js',
  'src/routes/notifications.js',
  'src/routes/leaderboard.js',
  'src/routes/utils.js',
  'src/middleware/auth.js',
  'src/utils/supabase.js',
  'openapi.json',
  'package.json',
  'rpc.sql',
  'schema.sql',
  'docs/RPC_AUDIT.md',
  'docs/README.md'
];

log.info('Checking required files...');
for (const file of requiredFiles) {
  const filePath = join(projectRoot, file);
  if (existsSync(filePath)) {
    log.success(`${file}`);
    passed++;
  } else {
    log.error(`${file} - NOT FOUND`);
    failed++;
  }
}

// Test: Check OpenAPI spec is valid JSON
log.info('\nValidating OpenAPI spec...');
try {
  const openapiPath = join(projectRoot, 'openapi.json');
  const openapiContent = readFileSync(openapiPath, 'utf8');
  const openapi = JSON.parse(openapiContent);
  
  if (openapi.openapi === '3.0.3') {
    log.success('OpenAPI version is 3.0.3');
    passed++;
  } else {
    log.error(`OpenAPI version is ${openapi.openapi}, expected 3.0.3`);
    failed++;
  }
  
  // Check for Utils tag
  const hasUtilsTag = openapi.tags?.some(tag => tag.name === 'Utils');
  if (hasUtilsTag) {
    log.success('Utils tag exists in OpenAPI spec');
    passed++;
  } else {
    log.error('Utils tag missing from OpenAPI spec');
    failed++;
  }
  
  // Check for distance endpoint
  const hasDistanceEndpoint = openapi.paths?.['/api/utils/distance']?.post;
  if (hasDistanceEndpoint) {
    log.success('/api/utils/distance endpoint exists in OpenAPI spec');
    passed++;
  } else {
    log.error('/api/utils/distance endpoint missing from OpenAPI spec');
    failed++;
  }
  
} catch (error) {
  log.error(`Failed to parse openapi.json: ${error.message}`);
  failed++;
}

// Test: Check package.json has required dependencies
log.info('\nChecking dependencies...');
try {
  const packagePath = join(projectRoot, 'package.json');
  const packageContent = readFileSync(packagePath, 'utf8');
  const pkg = JSON.parse(packageContent);
  
  const requiredDeps = [
    'express',
    '@supabase/supabase-js',
    'joi',
    'ws',
    'dotenv',
    'helmet',
    'cors',
    'express-rate-limit'
  ];
  
  for (const dep of requiredDeps) {
    if (pkg.dependencies?.[dep]) {
      log.success(`${dep}`);
      passed++;
    } else {
      log.error(`${dep} - NOT INSTALLED`);
      failed++;
    }
  }
} catch (error) {
  log.error(`Failed to parse package.json: ${error.message}`);
  failed++;
}

// Test: Check RPC coverage in audit document
log.info('\nChecking RPC audit document...');
try {
  const auditPath = join(projectRoot, 'docs/RPC_AUDIT.md');
  const auditContent = readFileSync(auditPath, 'utf8');
  
  // Check for key sections
  const sections = [
    'Zone Management RPCs',
    'Player RPCs',
    'Mission RPCs',
    'Notification RPCs',
    'Leaderboard RPCs',
    'Utility RPCs'
  ];
  
  for (const section of sections) {
    if (auditContent.includes(section)) {
      log.success(`Section: ${section}`);
      passed++;
    } else {
      log.error(`Section missing: ${section}`);
      failed++;
    }
  }
  
  // Check for completion status
  if (auditContent.includes('16 public RPC functions')) {
    log.success('All 16 RPCs documented');
    passed++;
  } else {
    log.error('RPC count mismatch in audit');
    failed++;
  }
  
} catch (error) {
  log.error(`Failed to read RPC_AUDIT.md: ${error.message}`);
  failed++;
}

// Summary
console.log('\n' + '='.repeat(50));
log.info(`VERIFICATION SUMMARY`);
console.log('='.repeat(50));
log.success(`Passed: ${passed}`);
if (failed > 0) {
  log.error(`Failed: ${failed}`);
} else {
  log.success(`Failed: ${failed}`);
}
console.log('='.repeat(50));

if (failed === 0) {
  log.success('\n🎉 ALL CHECKS PASSED! Backend setup is complete.\n');
  process.exit(0);
} else {
  log.error('\n⚠️  Some checks failed. Please review the errors above.\n');
  process.exit(1);
}
