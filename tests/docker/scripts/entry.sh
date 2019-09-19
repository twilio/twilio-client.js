#!/bin/bash
# Entry script inside the container
set -e
echo Starting Docker script

echo "node version:"
node --version
echo "npm version:"
npm --version
echo "os info:"
uname -a

echo "Starting tests"
cd /app
npm run test:integration

echo Ending Docker script
