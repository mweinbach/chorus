# Chorus Development Agent Guide

## Commands

-   **Dev:** `bun run vite:dev` (Vite), `bun run tauri:dev` (Tauri dev)
-   **Build:** `bun run build`
-   **QA/Prod:** `bun run tauri:qa`, `bun run tauri:prod`

## Code Style

-   **TypeScript:** Strict typing, ES2020 target. Avoid `as` casts.
-   **Paths:** Use `@ui/*`, `@core/*`, `@/*` aliases over relative imports.
-   **Naming:** PascalCase components, camelCase hooks with "use" prefix, "I"-prefixed interfaces.
-   **Formatting:** 4-space indentation, Prettier formatting.
-   **Imports:** Group by external, internal (@aliases), then relative.
-   **Error Handling:** All promises must be handled.

## Structure

-   **UI:** Components in `src/ui/components/`
-   **Core:** Business logic in `src/core/chorus/`
-   **Tauri:** Rust backend in `src-tauri/src/`
