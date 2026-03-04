# Agent Playwright Testing Guide

Guide for AI agents using Playwright MCP to test the CoCalc frontend interactively.

**Important**: Update this file as you discover new UI patterns, test procedures, or quirks during testing sessions. This is a living document — iterative learning by doing.

## Setup

### Dev Server

The local dev instance runs at `http://localhost:5000`. **Always ask the developer for current credentials** — they may change at any time.

### Authentication

Navigate to `http://localhost:5000`, click "Sign In", enter email/password. The sign-in may redirect; if the page shows "connection refused", navigate back to `http://localhost:5000` and wait for it to load.

### Build-Test Loop

The iterative development loop for frontend changes:

1. **Edit** code in `packages/frontend/...`
2. **Typecheck** (optional but recommended): `cd packages/frontend && pnpm tsc --noEmit`
3. **Build** (required): `cd packages/static && pnpm build-dev` — **wait until "Rspack compiled" appears** (typically 6-14 seconds)
4. **Refresh** the page: use `browser_evaluate` with `() => { location.reload(); }` or navigate to the URL again
5. **Wait** ~5-6 seconds for the app to connect and render (shows "Connecting..." then loads)
6. **Test** using Playwright snapshot/click/type tools

**Do not skip step 3.** If you only typecheck but don't build, the browser will still run old code.

Always dismiss the yellow "Low-grade hosting" banner with the "close Dismiss" button after each page load.

### Creating Test Content

Use terminal mode in the search bar to create test files:

```
!mkdir -p testdir subdir && touch a.txt b.py c.js d.md .hidden_file testdir/nested.txt
```

Type this in the explorer search bar (ref for `searchbox`) and press Enter.

### Modifying Files Externally (for Refresh Banner Testing)

To find the project's filesystem path, run `!pwd` in the explorer or flyout search bar. This executes `pwd` in the project sandbox and shows the full path in the terminal output area (below the search bar). The path varies per machine/setup.

Once you have the path, you can modify files directly from the Bash tool:

```bash
date >> /path/to/project/a.txt
```

This triggers the Conat listing watch to detect the change and show the yellow "Refresh" banner in the explorer (outside the 5-second grace window). The banner appears promptly once the watch subscription is established.

## Global Navigation

### Top Navigation Bar

- **CoCalc logo** (top left): navigates to landing page
- **Projects** button: list of all projects
- **Project tabs**: open project tabs (e.g., "title"), with close buttons
- **Help** button (medicine-box icon): opens help
- **Account circle** (letter initial, e.g., "B"): navigates to `/settings` — account settings page
- **Mail icon** with badge: messages/notifications
- **Wifi icon**: connection status
- **Expand icon**: fullscreen toggle

### Account Settings (`/settings`)

Accessed by clicking the account circle (letter avatar) in the top-right corner. Contains:

- **Left sidebar menu**: Settings, Profile, Preferences (expandable)
- **Preferences → Other** (`/settings/preferences/other`): Contains critical file explorer settings:
  - **Browser section**: Confirm Close, Standby timeout
  - **File Explorer section**:
    - "Current directory follows files" — syncs explorer/flyout to active file's directory
    - "Auto-update file listing" — bypasses deferred listing, immediately applies changes
    - "Dim file extensions" — grays out extensions
    - "Dim generated files" — grays out .aux, .log, .pyc, etc.
    - Default file sort (Name/Time/Size/Type)
    - Number of files per page
    - Filename generator style
  - **Projects section**:
    - Activity Bar mode (combobox): "Full pages and flyout panels" | "Buttons toggle flyouts" | "Buttons show full pages"
    - Show labels toggle

## Project Layout

A CoCalc project at `/projects/{project_id}/files/` has three main panels:

### Activity Bar (Left Edge)

Vertical icon bar with: Tabs, **Explorer**, New, Log, Find, Servers, Users, Upgrades, Processes, Settings.

In the default "Full pages and flyout panels" mode, each activity bar item has TWO click targets:

- **Clicking the text/icon** (e.g., "Explorer"): opens the **full page** view in the main area
- **Clicking the caret-right arrow** next to it: toggles the **flyout panel** (narrow side panel between activity bar and main area)

This distinction is important for testing — to open the flyout files panel, click the **caret-right** next to "Explorer", not the text itself.

- **Bottom of activity bar** has two buttons:
  - **layout** button: opens a dropdown menu to switch between:
    - "Full pages and flyout panels" (default — both flyout + full page visible)
    - "Buttons toggle flyouts" (flyout-only mode)
    - "Buttons show full pages" (full-page-only mode)
    - Plus "Hide labels" toggle
  - **vertical-right** button: collapses the entire left side (activity bar + flyout)
    - When collapsed, a **vertical-left** button appears to bring back the activity bar
    - Note: re-expanding only shows the activity bar — the flyout must be reopened separately by clicking the caret-right arrow

### Flyout Panel (Left Side)

The flyout is a narrow panel between the activity bar and the main area. When "Explorer" is selected, it shows a **file listing with its own independent browsing path**.

Key elements (top to bottom):

- **Flyout breadcrumb**: globe icon, Home / path segments, navigation buttons (swap, back, forward)
- **Sort buttons**: star, Name (with sort direction arrow), Size, Time
- **Type filter dropdown** (combobox labeled "Type"): filters by file extension (Folder, .md, .py, .js, .txt, etc.)
- **Upload button** and **New file button** (plus-circle)
- **Search/filter textbox**: substring filter or terminal mode (`!command` or `/path`)
- **Hidden files toggle** (eye/eye-invisible icon)
- **Snapshots button** (life-ring icon)
- **File count** and **Select/Clear buttons**
- **File list**: clickable items showing icon, star, filename
- **Bottom section**: collapsible file count bar, Terminal section

### Explorer (Main Area, Right Side)

The main file explorer with a table layout:

- **Server selector** (combobox): choose compute server
- **Breadcrumb bar**: Home / path / segments with navigation buttons
  - **Gray text in breadcrumb**: This is the **history path** — shows the deepest directory visited, allowing quick navigation back after going up. Not a bug!
  - **swap** button: switches explorer to the current global path
  - **left-circle/right-circle**: back/forward in navigation history
  - **up-circle**: go to parent directory
- **Action bar**: "New" button with dropdown, search bar with terminal mode
- **Toolbar row**: refresh button, Check All/Uncheck All, Upload, hidden files toggle, refresh icon, Backups
- **Status line**: item count, active filter badges with close-circle buttons, Help button
- **File table**: virtual-scrolled table with columns:
  - Checkbox (for selection)
  - Type icon (file-text, folder, language-specific icons)
  - Star (for favorites)
  - Color dot (for file status)
  - Name (with sort indicator)
  - Date Modified (relative time)
  - Size (bytes/items for folders)
  - Actions column (ellipsis menu on hover, download icon when selected)

## File Tabs and Editor Navigation

When you click a file in the explorer or flyout, it opens in a **file tab** in the main area. Multiple files can be open simultaneously.

### Tab Bar

Located between the flyout breadcrumb and the editor area:

- **File tabs**: each open file has a tab with icon + filename + close ("remove") button
- **Active tab**: has `[selected]` attribute in the snapshot
- **"Add tab" button** (plus icon): opens a new empty tab
- **"down-circle" button**: shows a dropdown of all open tabs (useful when many are open)
- Tab tooltip shows: "Shift-click: new window. Right-click: context menu."

### Navigating Between Files and Explorer

- **Click a file** in explorer/flyout → opens the file editor, switches to that tab
- **Click a file tab** → switches to that editor
- **Click "home" button** (top left, above the tabs) → returns to the explorer/files view
- The URL changes: `/files/` for explorer, `/files/d.md` for an open file
- File tabs persist — you can switch between editors and the explorer without losing open files

### Editor Types

Different file types open different editors:

- `.md` files: split-pane Markdown editor (left: source with formatting toolbar, right: rendered preview)
- `.txt` files: plain text Code editor (with Save, TimeTravel, Assistant buttons)
- `.py` files: Python code editor
- `.js` files: JavaScript code editor
- Each editor has: menu bar (File, Edit, Format, View, Help), toolbar, save button, TimeTravel button

### Getting Back to Explorer

Multiple ways to return to the file listing:

1. **Click "home" button** (house icon, top-left above file tabs) — goes to `/files/`
2. **Click Explorer in activity bar** — opens the explorer full page
3. **Navigate via URL** — go to `/projects/{id}/files/`

## Decoupled Browsing Paths

The flyout and explorer maintain **independent browsing paths**. Clicking a folder in the flyout navigates only the flyout; the explorer stays put. This is by design.

- Flyout path: stored in Redux as `flyout_browsing_path`
- Explorer path: stored in Redux as `explorer_browsing_path`
- Global path: `current_path` (tracks the active file's directory)

The "Current directory follows files" setting (in Account → Preferences → Other → File Explorer) syncs all three paths when switching file tabs.

## Priority Test Checklist

The most important interactions to verify after code changes, in priority order:

### P1 — Must Work

1. **Directory navigation is instant**: double-click a folder in explorer → listing appears immediately (no 15-second delay)
2. **File modification triggers refresh**: run `!date >> x.md` in terminal mode → yellow "Refresh" banner appears within ~15 seconds (after grace window)
3. **Flyout independent path**: click folder in flyout → flyout navigates, explorer stays on its directory
4. **Selection basics**: checkbox → select, shift-click → range, ctrl-click with selection → toggle
5. **Type filter**: open dropdown → shows correct extensions, select one → filters files, combined with text search works

### P2 — Should Work

6. **Back/forward navigation**: navigate into folder → back button works → forward button works
7. **Ctrl-click with nothing selected**: opens file in background tab (not toggle)
8. **Hidden files toggle**: shows/hides dotfiles, type filter dropdown excludes hidden-file extensions when off
9. **Context menu**: right-click file → all actions present, no duplicate keys
10. **Grace window**: page refresh → no spurious yellow "Refresh" banner within 5 seconds
11. **Terminal mode in flyout**: `!cd testdir` in flyout search → flyout navigates (not explorer)
12. **Breadcrumb history path**: gray text shows deepest visited dir, clickable to return

### P3 — Edge Cases

13. **Shift-click after filter/sort change**: anchor doesn't crash (bounds check)
14. **Ctrl-click context menu**: right-click with 1 file selected → single-file actions only
15. **DnD modifier guard**: shift-click does not activate drag targets
16. **Alt-Tab during drag**: drag state resets cleanly (hard to test with Playwright)

## Key UI Interactions Detail

### Navigation

- **Double-click folder** in explorer → navigates into it (should be instant)
- **Single-click folder** in flyout → navigates flyout only, explorer stays
- **Back/forward buttons** (left-circle/right-circle) → browser-like history
- **Up button** (up-circle) → parent directory
- **Breadcrumb segment clicks** → navigate to that path segment
- **Home icon** → root directory
- **Gray history text** in breadcrumb → click to navigate back to deepest visited dir

### Selection

- **Checkbox click** → toggles single file selection
- **Shift-click** row → range selection from last clicked to current
- **Shift-click** checkbox → range selection via checkbox too
- **Ctrl-click** with files selected → toggles selection (doesn't open)
- **Ctrl-click** with nothing selected → opens file in background tab
- **Check All** checkbox → selects/deselects all
- When files are selected: action buttons appear (Edit, Move, Copy, Delete, Compress, Share)
- Selection count shown in status line: "N of M items selected"

### Filters

- **Type filter dropdown**: shows file extensions present in current directory
  - Excludes hidden file extensions when hidden files are off
  - Stays available (shows all extensions) even when a type filter is active
  - Changing directory resets the type filter
- **Text search**: type in search bar to filter by filename substring
  - Shows banner: 'Only showing files matching "foo"'
  - Combined filters show as badges: "Markdown", "Contains 'foo'" with close buttons
- **Hidden files toggle** (eye/eye-invisible): shows/hides dotfiles
  - Shows badge "Hidden files" when active
  - Explorer and flyout each have their own toggle button

### Terminal Mode

- Type `!command` in search bar → executes in project sandbox
- Type `/path` → also terminal mode
- Flyout terminal: `!cd path` navigates the **flyout** path (not the explorer)
- Explorer terminal: `!cd path` navigates the **explorer** path
- Terminal output shown below search bar; errors in red

### Context Menu

- **Right-click** on file → context menu with: Open, Open in new window, View, Copy filename, Copy path, Rename, Copy, Move, Delete, Duplicate, Compress, Publish, Download
- **Right-click** on folder → similar but folder-appropriate actions
- Single file selected: single-file actions (Rename, Share)
- Multiple files selected: multi-file actions (no Rename)

### Deferred Listing

- After navigation or page load, there's a 5-second **grace window** where listing updates auto-apply
- After the grace window, external changes show a yellow "Refresh" banner (alert element with sync icon)
- Clicking the banner or the sync icon applies the update
- "Auto-update file listing" account setting bypasses deferred listing entirely

### Drag and Drop

- **Long press** (300ms) or **drag 3px** activates DnD
- **Shift/Ctrl-click** does NOT activate DnD (modifier guard)
- Drop on folder → move; Shift+drop → copy
- DnD cannot be easily tested with Playwright (requires real pointer events with timing)
- Cross-project drag: drag file to another project tab → opens copy dialog

## Playwright Tips

### Snapshot vs Screenshot

- Use `browser_snapshot` to get the accessibility tree — better for automation, gives refs for clicking
- Use `browser_take_screenshot` for visual verification — shows actual rendered layout
- Snapshots are much faster and more reliable than screenshots for finding elements

### Interacting with Elements

- Use `browser_click` with `ref` from the snapshot to click elements
- Use `modifiers: ["Shift"]` or `["Control"]` for modifier-click testing
- Use `browser_type` with `submit: true` to type and press Enter (for terminal mode, search)
- Use `browser_fill_form` for form fields (email/password on sign-in)
- Use `browser_press_key` with `Escape` to close menus/dropdowns
- Use `doubleClick: true` on `browser_click` to double-click (for opening folders in explorer)

### Timing and Navigation

- Use `browser_wait_for` with `time: 5` (or `time: 6`) after navigation/reload
- Use `browser_evaluate` with `() => { location.reload(); }` for hard refresh
- After `pnpm build-dev`, always refresh and wait before testing
- Tab IDs and element refs change on every page load — always get fresh refs from snapshots

### Element Identification

- The `alert` element type is used for banners (hosting warning, refresh indicator)
- Flyout combobox for type filter: look for `combobox` inside the flyout's sort/filter area
- Explorer search bar: `searchbox` with name containing "Filter files"
- Flyout search bar: `textbox` with name containing "Filter or"
- Account circle: look for a `generic` with a single letter (user initial, e.g., "B")
- Activity bar items: `generic` elements with icon + text (e.g., "Explorer", "New", "Log")

### Common Gotchas

- The "Low-grade hosting" banner appears on every page load — dismiss it first
- Sign-in may redirect to a port that Playwright can't reach — navigate back to localhost:5000
- The app shows "Connecting..." for 1-3 seconds on load — wait for it
- Element refs are NOT stable across page loads — never cache them
- The flyout and explorer have separate search bars, type filters, and hidden-file toggles
- Modifier keys on clicks: use `["Control"]` not `["Ctrl"]`
