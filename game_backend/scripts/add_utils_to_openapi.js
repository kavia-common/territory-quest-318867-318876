#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const openapiPath = join(__dirname, '..', 'openapi.json');

console.log('Reading openapi.json...');
const openapi = JSON.parse(readFileSync(openapiPath, 'utf8'));

// Add Utils tag if not exists
if (!openapi.tags.some(tag => tag.name === 'Utils')) {
  console.log('Adding Utils tag...');
  openapi.tags.push({
    name: 'Utils',
    description: 'Utility endpoints for calculations and helpers'
  });
}

// Add distance endpoint if not exists
if (!openapi.paths['/api/utils/distance']) {
  console.log('Adding /api/utils/distance endpoint...');
  openapi.paths['/api/utils/distance'] = {
    post: {
      tags: ['Utils'],
      summary: 'Calculate distance between two points',
      description: 'Calculate the distance in meters between two geographic coordinates using the Haversine formula',
      operationId: 'calculateDistance',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['lat1', 'lon1', 'lat2', 'lon2'],
              properties: {
                lat1: {
                  type: 'number',
                  minimum: -90,
                  maximum: 90,
                  description: 'First point latitude'
                },
                lon1: {
                  type: 'number',
                  minimum: -180,
                  maximum: 180,
                  description: 'First point longitude'
                },
                lat2: {
                  type: 'number',
                  minimum: -90,
                  maximum: 90,
                  description: 'Second point latitude'
                },
                lon2: {
                  type: 'number',
                  minimum: -180,
                  maximum: 180,
                  description: 'Second point longitude'
                }
              }
            }
          }
        }
      },
      responses: {
        '200': {
          description: 'Distance calculated successfully',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/SuccessResponse' },
                  {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          distance_meters: {
                            type: 'number',
                            description: 'Distance in meters'
                          }
                        }
                      }
                    }
                  }
                ]
              }
            }
          }
        },
        '400': {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' }
            }
          }
        }
      }
    }
  };
}

// Update timestamp
openapi.info.generatedAt = new Date().toISOString();

console.log('Writing updated openapi.json...');
writeFileSync(openapiPath, JSON.stringify(openapi, null, 2), 'utf8');

console.log('✅ OpenAPI spec updated successfully!');
