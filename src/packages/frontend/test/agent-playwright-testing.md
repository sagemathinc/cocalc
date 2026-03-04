# Agent Playwright Testing Guide

Guide for AI agents using Playwright MCP to test the CoCalc frontend interactively.

## Setup

### Dev Server

The local dev instance runs at `http://localhost:5000`. Always ask the developer for current credentials — they may change at any time.

### Authentication

Navigate to `http://localhost:5000`, click "Sign In", enter email/password. The sign-in may redirect; if the page shows "connection refused", navigate back to `http://localhost:5000` and wait for it to load.

### Build-Test Loop

The iterative development loop for frontend changes:

1. **Edit** code in `packages/frontend/...`
2. **Typecheck** (optional): `cd packages/frontend && pnpm tsc --noEmit`
3. **Build** (required): `cd packages/static && pnpm build-dev` — wait until "Rspack compiled" appears
4. **Refresh** the page: use `page.evaluate('() => { location.reload(); }')` or navigate to the URL again
5. **Wait** ~5 seconds for the app to connect and render
6. **Test** using Playwright snapshot/click/type tools

Always dismiss the yellow "Low-grade hosting" banner with the "close Dismiss" button after each page load.

## Project Layout

A CoCalc project at `/projects/{project_id}/files/` has three main panels:

### Activity Bar (Left Edge)

Vertical icon bar with: Tabs, **Explorer**, New, Log, Find, Servers, Users, Upgrades, Processes, Settings. Clicking an icon opens the corresponding **flyout panel**.

### Flyout Panel (Left Side)

The flyout is a narrow panel between the activity bar and the main area. When "Explorer" is selected, it shows a **file listing with its own independent browsing path**.

Key elements:

- **Sort buttons**: star, Name, Size, Time
- **Type filter dropdown** (combobox labeled "Type"): filters by file extension (Folder, .md, .py, .js, .txt, etc.)
- **Search/filter textbox**: substring filter or terminal mode (`!command` or `/path`)
- **Hidden files toggle** (eye icon)
- **File list**: clickable items with star, icon, filename
- **Bottom bar**: file count, Select/Clear buttons, Terminal section

### Explorer (Main Area, Right Side)

The main file explorer with a table layout:

- **Breadcrumb bar**: Server selector, Home / path / segments, back/forward/up buttons
  - **Gray text in breadcrumb**: This is the **history path** — shows the deepest directory visited, allowing quick navigation back. Not a bug!
- **Action bar**: New button, dropdown, search bar
- **Toolbar**: Check All, Upload, hidden files toggle, refresh, Backups
- **File table**: Checkbox, type icon, star, color dot, Name, Date Modified, Size columns
- **Status line**: item count, active filters with close badges, Help button

## Decoupled Browsing Paths

The flyout and explorer maintain **independent browsing paths**. Clicking a folder in the flyout navigates only the flyout; the explorer stays put. This is by design.

- Flyout path: stored in Redux as `flyout_browsing_path`
- Explorer path: stored in Redux as `explorer_browsing_path`
- Global path: `current_path` (tracks the active file's directory)

## Key UI Interactions to Test

### Navigation

- **Double-click folder** in explorer → navigates into it (should be instant)
- **Click folder** in flyout → navigates flyout only, explorer stays
- **Back/forward buttons** (left-circle/right-circle) → browser-like history
- **Up button** (up-circle) → parent directory
- **Breadcrumb clicks** → navigate to that path segment
- **Home icon** → root directory

### Selection

- **Checkbox click** → toggles single file selection
- **Shift-click** row → range selection from last clicked to current
- **Shift-click** checkbox → range selection via checkbox too
- **Ctrl-click** with files selected → toggles selection (doesn't open)
- **Ctrl-click** with nothing selected → opens file in background tab
- **Check All** checkbox → selects/deselects all
- When files are selected: action buttons appear (Edit, Move, Copy, Delete, Compress, Share)

### Filters

- **Type filter dropdown**: shows file extensions present in current directory
  - Excludes hidden file extensions when hidden files are off
  - Stays available (not collapsed) when a type filter is active
- **Text search**: type in search bar to filter by filename substring
  - Combined filters show as badges: "Markdown", "Contains 'foo'" with close buttons
- **Hidden files toggle** (eye/eye-invisible): shows/hides dotfiles
  - Shows badge "Hidden files" when active

### Terminal Mode

- Type `!command` in search bar → executes in project sandbox
- Type `/path` → also terminal mode
- Flyout terminal: `!cd path` navigates the **flyout** path (not the explorer)

### Context Menu

- **Right-click** on file → context menu with: Open, Open in new window, View, Copy filename, Copy path, Rename, Copy, Move, Delete, Duplicate, Compress, Publish, Download

### Deferred Listing

- After navigation or page load, there's a 5-second **grace window** where listing updates auto-apply
- After the grace window, external changes show a yellow "Refresh" banner
- The banner has a sync icon and "Refresh" text

### Drag and Drop

- **Long press** (300ms) or **drag 3px** activates DnD
- **Shift/Ctrl-click** does NOT activate DnD (modifier guard)
- Drop on folder → move; Shift+drop → copy
- DnD cannot be easily tested with Playwright (requires real pointer events with timing)

## Playwright Tips

- Use `browser_snapshot` to get the accessibility tree (better than screenshots for automation)
- Use `browser_click` with `ref` from the snapshot to click elements
- Use `modifiers: ["Shift"]` or `["Control"]` for modifier-click testing
- Use `browser_type` with `submit: true` to type and press Enter (for terminal mode)
- Use `browser_wait_for` with `time: 5` after navigation/reload to let the app render
- Use `browser_evaluate` with `() => { location.reload(); }` for hard refresh
- Tab IDs change on every page load — always get fresh refs from snapshots
- The `alert` element type is used for banners (hosting warning, refresh indicator)
