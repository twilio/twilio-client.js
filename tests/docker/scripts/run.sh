#!/bin/bash
# Start of containerized test, originating from host machine
set -e
echo "Preparing environment variables"
cat > env.list <<END
BVER=$BVER
ACCOUNT_SID=$ACCOUNT_SID
AUTH_TOKEN=$AUTH_TOKEN
APPLICATION_SID=$APPLICATION_SID
API_KEY_SECRET=$API_KEY_SECRET
API_KEY_SID=$API_KEY_SID
END

echo "Building docker image"
docker build --tag=twilio-client:1.0.0 .

echo "Preparing container"
docker create --env-file env.list --name twilio-client-network-test --entrypoint /app/entry.sh twilio-client:1.0.0

echo "Copying entry point script"
docker cp scripts/entry.sh twilio-client-network-test:app

echo "Copying repository"
docker cp -a ../../ twilio-client-network-test:app

echo "Running the image"
docker start -a twilio-client-network-test

echo "Cleaning up"
docker rm twilio-client-network-test
rm env.list
