#!/bin/bash

# Script to run validation checks (lint and format)
# Usage: ./validate.sh [--fix]

set -e

# Check if --fix flag is provided
FIX_FLAG=""
if [[ "$1" == "--fix" ]]; then
    FIX_FLAG="--fix"
    echo "Running validation with auto-fix enabled..."
else
    echo "Running validation checks..."
fi

# Run lint checks
if [[ -n "$FIX_FLAG" ]]; then
    echo "Running lint with auto-fix..."
    bun run lint:fix
else
    echo "Running lint checks..."
    bun run lint
fi

# Run format checks
if [[ -n "$FIX_FLAG" ]]; then
    echo "Running prettier with auto-fix..."
    bun run format
else
    echo "Running format checks..."
    bun run format:check
fi

echo "Validation complete!"
