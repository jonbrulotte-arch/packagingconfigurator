#!/usr/bin/env bash
set -e

echo "Building server and client..."
npm run build

echo "Starting server on port ${PORT:-3002}..."
npm start --prefix server
