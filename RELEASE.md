# Release Process

This document outlines the steps to create a new release of our application.

## Prerequisites

-   Ensure you have push access to the `main` and `release` branches.
-   Make sure all changes you want to include in the release are merged into the `main` branch.

## Release Steps

Recommended: run ./script/interactive_release.sh

Manual:

1. **Update main branch**
   Ensure your local `main` branch is up to date:

    ```bash
    git checkout main
    git pull origin main
    ```

2. **Update version number**
   Update the version number in relevant files (e.g., `package.json`, `Cargo.toml`).
   Commit and push these changes to `main`.

3. **Checkout release branch**
   Switch to the `release` branch:

    ```bash
    git checkout release
    ```

4. **Merge changes from main**
   Pull the latest changes from `main` into the `release` branch:

    ```bash
    git pull origin main
    ```

5. **Push to release branch**
   Push the updated `release` branch to GitHub:

    ```bash
    git push origin release
    ```

6. **Monitor GitHub Actions**
   The push to `release` will trigger our GitHub Actions workflow. This will:

    - Create a new release draft
    - Build the application
    - Attach built artifacts to the release

7. **Finalize Release**
    - Go to the GitHub releases page
    - Review the draft release
    - Make any necessary edits to the release notes
    - Publish the release when ready

## Post-Release

-   Notify the team that a new release has been published
-   Update any necessary documentation or changelogs
-   Begin the next development cycle on `main`

## Troubleshooting

If you encounter any issues during the release process, please contact the DevOps team or the repository maintainer.

## Building Locally

To build the application locally, run the following command:

```bash
bun run tauri -- build
```

Make sure you have the necessary environment variables set for your platform. Ask Charlie about this.
