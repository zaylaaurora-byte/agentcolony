#!/bin/bash
# Start the AgentChat mini-service
cd /home/z/my-project/mini-services/agent-chat
echo "Starting AgentChat service on port 3004..."
while true; do
  node dist/index.js
  echo "AgentChat service crashed, restarting in 2s..."
  sleep 2
done
