#!/bin/sh

set -eu

# Always run from the directory containing this script.
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$PROJECT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Error: pnpm is not installed. Install it with: brew install node pnpm"
  exit 1
fi

echo "Installing dependencies..."
pnpm install --config.minimumReleaseAge=0

echo "Building the app..."
pnpm build

echo "Starting the app..."
echo "Open the Local URL printed below, usually http://localhost:5173/"
exec pnpm dev
