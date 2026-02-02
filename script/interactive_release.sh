#!/bin/bash

set -e

echo "🚀 Starting interactive release process..."

# # Run lint and format checks
# echo "🔍 Running lint checks..."
# if ! bun run lint; then
#     echo "❌ Lint errors found. Please fix them before releasing."
#     exit 1
# fi

echo "🎨 Running format checks..."
if ! bun run format:check; then
    echo "❌ Formatting issues found. Run 'bun run format' to fix them."
    exit 1
fi

echo "✅ All lint and format checks passed!"

echo "Running bunx tsc..."
bunx tsc

# Step 0: Pull latest from origin/main
echo "📥 Pulling latest changes from origin/main..."
git checkout main
git pull origin main

# Step 1: Bump version
echo "🔢 Version bumping..."
read -p "Do you want to bump a patch (0.0.1), minor version (0.1.0), or skip bumping? (patch/minor/skip): " bump_type
while [[ "$bump_type" != "patch" && "$bump_type" != "minor" && "$bump_type" != "skip" ]]; do
    read -p "Invalid input. Please enter 'patch', 'minor', or 'skip': " bump_type
done

if [[ "$bump_type" != "skip" ]]; then
    # Store the current version before bumping
    current_version=$(awk -F'"' '/"version": ".+"/{ print $4; exit; }' package.json)
    
    ./script/bump_version.sh "$bump_type"
    
    # Get the new version after bumping
    new_version=$(awk -F'"' '/"version": ".+"/{ print $4; exit; }' package.json)
    echo "Version bumped from $current_version to $new_version"
    
    # Also update the version in dev and qa config files
    sed -i '' "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" src-tauri/tauri.dev.conf.json
    sed -i '' "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" src-tauri/tauri.qa.conf.json
    
    read -p "Do you want to continue with this version? (yes/no) [yes]: " confirm
    if [[ "$confirm" != "yes" && "$confirm" != "" ]]; then
        echo "Undoing version bump..."
        # Restore the original versions in all files
        sed -i '' "s/\"version\": \"$new_version\"/\"version\": \"$current_version\"/" package.json
        sed -i '' "s/\"version\": \"$new_version\"/\"version\": \"$current_version\"/" src-tauri/tauri.conf.json
        sed -i '' "s/\"version\": \"$new_version\"/\"version\": \"$current_version\"/" src-tauri/tauri.dev.conf.json
        sed -i '' "s/\"version\": \"$new_version\"/\"version\": \"$current_version\"/" src-tauri/tauri.qa.conf.json
        echo "Version bump undone. Exiting..."
        exit 1
    fi

    # Step 2: Push to main
    echo "📤 Pushing changes to main..."
    git add package.json src-tauri/tauri.conf.json src-tauri/tauri.dev.conf.json src-tauri/tauri.qa.conf.json
    git commit -m "Bump version: $bump_type"
    git push origin main
else
    echo "Skipping version bump."
fi

# Step 3: Run release script
echo "🚀 Running release script..."
./script/release.sh

# Step 4: Open the changelog 
open "https://github.com/meltylabs/chorus-releases/edit/main/CHANGELOG.md"

echo "✅ Interactive release process completed!"
