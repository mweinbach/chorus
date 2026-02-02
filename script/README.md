# Chorus Development Scripts

## setup-instance.sh

Sets up a new isolated development instance by:

-   Installing dependencies with `bun install`
-   Creating the Application Support directory for the instance
-   Copying `auth.dat` from the main dev instance (if it exists)

### Usage

```bash
# Using the script directly
./script/setup-instance.sh [instance-name]

# Using bun (recommended)
bun run setup [instance-name]
```

### Example

```bash
# Set up a new instance called "feature-auth"
bun run setup feature-auth

# Set up using the repo directory name as instance name
bun run setup
```

## dev-instance.sh

This script allows you to run multiple isolated instances of Chorus on the same machine. Each instance has its own data directory and can be run simultaneously.

### Usage

```bash
# Using the script directly
./script/dev-instance.sh [instance-name]

# Using bun (recommended)
bun run workspace [instance-name]
```

### Examples

```bash
# Run a default instance (uses the repo directory name, e.g., "chorus")
bun run workspace

# Run an instance for a specific feature branch
bun run workspace feature-auth

# Run an instance for testing
bun run workspace test-instance

# Run multiple instances simultaneously (using bash)
bun run workspace instance1 &
bun run workspace instance2 &
```

### Features

1. **Isolated Data**: Each instance stores its data in a separate directory under `~/Library/Application Support/sh.chorus.app.dev.<instance-name>/`
2. **Visual Indicator**: The instance name appears in the DEV MODE indicator in the sidebar
3. **Unique App Identifier**: Each instance has a unique identifier to prevent conflicts
4. **Custom Window Title**: The window title includes the instance name
5. **Automatic Port Assignment**: Each instance gets a unique port (1420-1520) based on the instance name hash to avoid conflicts

### How it Works

The script:

1. Takes an instance name as a parameter (defaults to the repo directory name if not provided)
2. Sanitizes the name to be filesystem-safe
3. Creates a unique app identifier like `sh.chorus.app.dev.my_branch_name`
4. Calculates a unique port number based on the instance name hash
5. Sets environment variables:
    - `CHORUS_INSTANCE_NAME` - displayed in the UI
    - `VITE_PORT` and `VITE_HMR_PORT` - for the dev server
6. Launches `tauri dev` with a custom configuration override

### Notes

-   If no instance name is provided, it defaults to the name of the directory containing the Chorus git repo
-   Instance names are sanitized to only contain alphanumeric characters, hyphens, and underscores
-   Data for each instance is stored separately and persists between runs
-   You can run multiple instances simultaneously without conflicts
-   The temporary configuration file is automatically cleaned up when the app exits
