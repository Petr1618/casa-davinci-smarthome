#!/bin/bash

# Casa DaVinci - Deploy to Raspberry Pi
# Syncs frontend and backend to the Pi

PI_HOST="casa-davinci.local"
PI_USER="pi"
PI_PATH="/home/pi/casa-davinci"

echo "Deploying Casa DaVinci to Raspberry Pi..."
echo "Target: ${PI_USER}@${PI_HOST}:${PI_PATH}"
echo ""

# Create target directory if it doesn't exist
ssh ${PI_USER}@${PI_HOST} "mkdir -p ${PI_PATH}"

# Sync files (excluding docs, .DS_Store, and .git)
rsync -avz --progress \
    --exclude '.DS_Store' \
    --exclude '.git' \
    --exclude 'docs' \
    --exclude '.claude' \
    --exclude 'deploy.sh' \
    ./ ${PI_USER}@${PI_HOST}:${PI_PATH}/

echo ""
echo "Deployment complete!"
echo "SSH into Pi: ssh ${PI_USER}@${PI_HOST}"
echo "Project location: ${PI_PATH}"
