#!/usr/bin/env node

/**
 * OpenAPI 3.0 Specification Generator
 * Generates openapi.json from the static template
 * In a more advanced setup, this could analyze route files dynamically
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// PUBLIC_INTERFACE
/**
 * Generate OpenAPI specification
 * Reads the base openapi.json and outputs it (can be extended for dynamic generation)
 */
function generateOpenAPISpec() {
  try {
    console.log('🔧 Generating OpenAPI specification...');
    
    // Read the openapi.json template
    const openapiPath = join(rootDir, 'openapi.json');
    const openapiContent = readFileSync(openapiPath, 'utf8');
    const openapiSpec = JSON.parse(openapiContent);
    
    // Add generation timestamp
    openapiSpec.info.generatedAt = new Date().toISOString();
    
    // In future, could dynamically scan routes and generate paths
    // For now, we use the static template
    
    // Write the output
    const outputPath = join(rootDir, 'openapi.json');
    writeFileSync(outputPath, JSON.stringify(openapiSpec, null, 2), 'utf8');
    
    console.log('✅ OpenAPI specification generated successfully');
    console.log(`📄 Output: ${outputPath}`);
    console.log(`📊 Endpoints documented: ${Object.keys(openapiSpec.paths).length}`);
    
    return openapiSpec;
  } catch (error) {
    console.error('❌ Error generating OpenAPI specification:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateOpenAPISpec();
}

export { generateOpenAPISpec };
