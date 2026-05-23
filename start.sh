#!/usr/bin/env bash
set -e

echo "Building server and client..."
npm run build

PORT="${PORT:-3002}"

# Stop any existing process on the server port before starting
if command -v fuser &>/dev/null; then
  fuser -k "${PORT}/tcp" 2>/dev/null && echo "Stopped existing server on port ${PORT}." || true
elif command -v pkill &>/dev/null; then
  pkill -f "node dist/index.js" 2>/dev/null && echo "Stopped existing server." || true
fi

sleep 1

echo "Starting server on port ${PORT}..."
PORT="$PORT" npm start --prefix server
