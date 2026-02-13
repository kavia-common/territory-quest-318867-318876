#!/bin/bash

# TurfRun Backend Startup Script
# Usage: ./start.sh

set -e  # Exit on error

echo "🚀 Starting TurfRun Backend Server..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  Warning: .env file not found${NC}"
    echo "Please create a .env file with the required environment variables"
    echo "See .env.example for reference"
    echo ""
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
    echo ""
fi

# Generate OpenAPI spec
echo -e "${GREEN}📄 Generating OpenAPI specification...${NC}"
if [ -f "scripts/generate_openapi.js" ]; then
    node scripts/generate_openapi.js
else
    echo -e "${YELLOW}⚠️  OpenAPI generator script not found, skipping...${NC}"
fi
echo ""

# Start the server
echo -e "${GREEN}🎯 Starting server...${NC}"
echo ""

# Check if we're in development or production mode
if [ "${NODE_ENV}" = "production" ]; then
    echo -e "${GREEN}🏭 Running in PRODUCTION mode${NC}"
    npm start
else
    echo -e "${GREEN}🔧 Running in DEVELOPMENT mode (use 'npm run dev' for auto-reload)${NC}"
    npm start
fi
