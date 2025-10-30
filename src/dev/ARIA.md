# ARIA Landmarks and Accessibility in CoCalc Frontend

This document explains how to implement ARIA landmarks in the CoCalc frontend to enable proper landmark-based navigation for assistive technology users.

## What are ARIA Landmarks?

ARIA landmarks identify major page sections for screen reader navigation. The eight landmark roles are:

- **`main`** - Primary content area
- **`navigation`** - Navigation links/sections
- **`complementary`** - Sidebars, supplementary content
- **`region`** - Generic sections (requires `aria-label`)
- **`search`**, **`banner`**, **`contentinfo`**, **`form`** - Specialized roles as needed

## CoCalc Frontend Structure

The frontend has a **three-level hierarchy**:

1. **Application Shell** - Top navigation, project tabs, main content area
2. **Project Workspace** - File tabs, activity bar, editor, sidebar
3. **Editor Features** - Toolbars, symbols, content areas

## Implementation Guidelines

### Core Principles

1. **Use semantic HTML first** - `<main>`, `<nav>`, `<aside>`, `<footer>` automatically create landmarks
2. **Use `role="region"` + `aria-label`** for custom sections
3. **Make labels dynamic and context-aware** - Include relevant details (file names, types, counts)
4. **Keep labels concise** - Use abbreviations when context is clear (e.g., "PDF (12p): {path}")
5. **Maximum ~7 landmarks per page** - Avoid landmark overload

### Pattern: Labeled Regions

```tsx
// Navigation
<nav aria-label="Settings menu">...</nav>

// Sidebar/supplementary content
<aside role="complementary" aria-label="Project filters">...</aside>

// Custom sections with role="region"
<div role="region" aria-label="Editor: script.py">...</div>
<div role="region" aria-label="Build log: document.tex">...</div>

// Heading-based labels (alternative to aria-label)
<h2 id="section-id">My Section</h2>
<div role="region" aria-labelledby="section-id">...</div>

// When using Ant Design components that support ARIA props,
// apply role/aria-label directly without wrapping in div:
<Space.Compact role="region" aria-label="Zoom controls">
  {/* children */}
</Space.Compact>

// ✅ GOOD: Direct ARIA on component
<Button aria-label="Save file" />

// ❌ AVOID: Unnecessary wrapping
<div role="button" aria-label="Save file">
  <Button />
</div>
```

### Dynamic Label Examples

- Menu/Navigation: `"Account settings menu"`, `"Open files in {projectName}"`
- Regions: `"Editor: {filePath}"`, `"Build log: {filePath}"`
- Sections with counts: `"Projects list (5 total)"`, `"Issues (2e 1w): {path}"`
- Conditional content: Update aria-label when content changes

## Split Editors with Multiple Frames

When editors are split into multiple frames, use nested regions with clear labels:

- Outer region: describes the split direction and file path
- Inner regions: describe each frame's content type

Example patterns:

```tsx
// Outer split container
<div role="region" aria-label={`Vertical split: ${path}`}>
  <div role="region" aria-label={`Code: ${path}`}>
    {/* code frame */}
  </div>
  <div role="region" aria-label={`Output: ${path}`}>
    {/* output frame */}
  </div>
</div>
```

Key: Include file path and describe frame contents clearly.

## Key Components to Annotate

When implementing ARIA landmarks in CoCalc, focus on these key component types:

### 1. Editor Toolbars & Menus

- Main container: `<div role="region" aria-label="${fileType} editor toolbar for ${fileName}">`
- Menus: `<nav aria-label="${menuType} menu">`
- Control buttons: Add `aria-label` with context (e.g., "Save {fileName}", "Build {fileName}")
- Status indicators: Use `aria-live="polite"` for changes

### 2. Jupyter Notebook Cells

- Cell container: `<div role="region" aria-label="Code cell {N} (current, has error)">`
- Cell input: `<div role="region" aria-label="Input for Code cell {N}">`
- Cell output: `<div role="region" aria-label="Output for Code cell {N}">`
- Cell controls: `<div role="region" aria-label="Controls for Code cell {N}">`

Include cell type, number, and status in labels.

### 3. Settings & Preferences Pages

- Main content: `<main role="main" aria-label="Settings management">`
- Navigation menu: `<nav aria-label="Settings menu">`
- Section containers: `<div role="region" aria-label="Profile settings">` for each section
- Form groups: `<div role="region" aria-label="{settingType} configuration">`

### 4. Split Editors

- Outer split container: `<div role="region" aria-label="Vertical split: {path}">`
- Individual frames: `<div role="region" aria-label="Code: {path}">`, `<div role="region" aria-label="Output: {path}">`

## Resources

- [W3C WAI ARIA Landmarks](https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/)
- [MDN: ARIA Landmarks](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/main_role)
- [WebAIM: Landmark Regions](https://webaim.org/articles/screenreader_testing/#landmarks)

## Current Implementation Status

### ✅ Completed Areas - October 2025

The following areas have been successfully implemented with ARIA landmarks and labels:

#### Phase 1: Application Shell

- Root `<main>` landmark in `packages/frontend/app/page.tsx`
- Top navigation bar with `aria-label="Application navigation"`

#### Phase 2: Project Workspace

- File tab navigation with dynamic project context
- Activity bar and sidebar landmarks with `role="complementary"`
- Main editor area with appropriate main landmark

#### Phase 3: Frame Tree Split Editors

- Split frame annotations with vertical/horizontal indicators
- File path context in labels (e.g., "Editor frames split vertically: /path/to/file.py")

#### Phase 4: Editor Title Bar

- Toolbar region annotations for each editor type
- Dynamic labels including editor type and filename

#### Phase 5: Jupyter Notebook Cells

- Cell regions with number, type (code/markdown), and status
- Examples: "Code cell 5 (current, has error)", "Markdown cell 2"

#### Phase 6: LaTeX Editor

- Main output region: `"LaTeX output: {path}"`
- PDF preview tab: `"PDF preview: {path} ({totalPages} pages)"`
- Contents tab: `"Table of contents: {path}"`
- Build output: `"Build output: {path}"`
- Problems tab: `"Errors and warnings: {path} ({error count})"`
- Statistics and output files regions with dynamic labels
- Modified files: `output.tsx`, `output-stats.tsx`, `output-files.tsx`

#### Phase 7: Code Editor (All Text Editors)

- Generic text editor region with `aria-label="Text editor: {path}"`
- Applied to all text-based editors (Python, JavaScript, LaTeX source, etc.)
- Modified file: `codemirror-editor.tsx`

#### Phase 8: Projects List Page

- Main projects management region: `role="main" aria-label="Projects management"`
- Project filters and controls: `"Project filters and controls"`
- Projects list with dynamic count: `"Projects list ({count} project(s) total)"`
- Search region: `"Search projects and files"`
- Starred projects section with count: `"Starred projects ({count})"`
- Modified files: `projects-page.tsx`, `filename-search.tsx`, `projects-starred.tsx`

### All Changes Include:

✅ Dynamic `aria-label` attributes with contextual information
✅ File paths, editor types, cell numbers, and status indicators
✅ Proper semantic HTML and ARIA roles
✅ All code formatted with prettier
✅ Successful compilation with `pnpm build-dev`

## Remaining Work - Comprehensive Task List

### Phase 9: Account Settings Pages ✅ COMPLETED (Oct 28, 2025)

**Files Modified**:

- `packages/frontend/account/account-page.tsx` - Main account settings layout
- `packages/frontend/account/account-preferences.tsx` - Preferences wrapper
- `packages/frontend/account/account-preferences-profile.tsx`
- `packages/frontend/account/account-preferences-appearance.tsx`
- `packages/frontend/account/account-preferences-ai.tsx`
- `packages/frontend/account/account-preferences-communication.tsx`
- `packages/frontend/account/account-preferences-editor.tsx`
- `packages/frontend/account/account-preferences-keyboard.tsx`
- `packages/frontend/account/account-preferences-other.tsx`
- `packages/frontend/account/account-preferences-security.tsx`

**Changes**:

- ✅ Main layout: `<main role="main" aria-label="Account settings">`
- ✅ Settings menu: `<nav aria-label="Account settings menu">`
- ✅ Content regions: `role="region" aria-label="{settingType} settings"`
- ✅ Menu toggle button: `aria-label="Expand/Collapse menu"`
- ✅ Preference sub-sections all have region labels

### Phase 10: Editor Frame Infrastructure ✅ COMPLETED

**Priority: HIGH** - Core editor system needs comprehensive ARIA

#### 10a: Frame Tree System

Location: `packages/frontend/frame-editors/frame-tree/`

- [x] **frame-tree.tsx** - Split editor container
  - [x] ✅ Already had ARIA labels for Vertical/Horizontal splits

- [x] **title-bar.tsx** (38KB - extensive)
  - [x] Main toolbar: `role="region" aria-label="{fileType} editor toolbar"`
  - [x] Menu navigation: `<nav aria-label="{fileType} editor controls and menus"`
  - [x] Control buttons: Added aria-label to all frame control buttons
  - [x] Symbol/outline bar: `aria-label="Symbols and outline for {fileName}"`
  - [x] Frame controls: `aria-label="Layout controls for {fileName}"`
  - [x] Status indicator: `aria-live="polite"` for connection status
  - [x] More commands button: `aria-label` and `aria-expanded` state
  - [x] Split/maximize/close buttons: Complete aria-labels

- [x] **editor.tsx** - Editor container
  - [x] Added `role="application"` with context-aware aria-label
  - [x] Focus management for keyboard support
  - [x] Announce editor type and path

- [x] **status-bar.tsx** - File/editor status
  - [x] Converted to ARIA live region: `role="status"` with `aria-live="polite"`
  - [x] Added meaningful status labels and clear button accessibility
  - [x] Icon component enhanced to support ARIA attributes

#### 10b: Individual Editor Types

Location: `packages/frontend/frame-editors/`

**Code Editor**:

- [ ] `code-editor/codemirror-editor.tsx` - Core code editor
  - [ ] Editor container needs role/label
  - [ ] Gutter (line numbers) needs aria-label
  - [ ] Breakpoint indicators need description
  - [ ] Syntax error markers need aria-label

**Jupyter Notebook Editor**:

- [ ] `jupyter-editor/` - Cell-based notebook
  - [ ] Cell container: `role="region" aria-label="Code/Markdown cell {N}"`
  - [ ] Cell input: `role="region" aria-label="Input for cell {N}"`
  - [ ] Cell output: `role="region" aria-label="Output for cell {N}"`
  - [ ] Cell toolbar: `role="region" aria-label="Controls for cell {N}"`
  - [ ] Kernel status: `aria-live="polite"`
  - [ ] Run state: `aria-busy` when executing

**Markdown Editor**:

- [ ] `markdown-editor/` - Markdown preview/edit
  - [ ] Preview/Edit toggle: Clear mode indication
  - [ ] Preview pane: `role="region" aria-label="Markdown preview: {fileName}"`

**LaTeX Editor**:

- [ ] `latex-editor/` - Already partially done, needs refinement
  - [ ] ✅ PDF preview annotated
  - [ ] ✅ Build output annotated
  - [ ] [ ] Build status: Needs aria-live for real-time updates
  - [ ] [ ] Error navigation: Add keyboard shortcuts for error jumping
  - [ ] [ ] Sync indicators: Clearer accessibility labels

**Terminal Editor**:

- [ ] `terminal-editor/` - Terminal/console
  - [ ] Terminal output: `role="region" aria-label="Terminal: {fileName}"`
  - [ ] Terminal input: Clear input field label
  - [ ] Output scrolling: Announce new output with aria-live
  - [ ] Cursor position: Announce when scrolling

**Other Editors** (Lower Priority):

- [ ] `sagews-editor/` - SageWS worksheets
- [ ] `slides-editor/` - Presentations
- [ ] `whiteboard-editor/` - Drawing/whiteboard
- [ ] `csv-editor/` - CSV data tables
- [ ] `html-editor/` - HTML preview
- [ ] `pdf-editor/` - PDF viewer
- [ ] `qmd-editor/` - Quarto markdown
- [ ] `rmd-editor/` - R markdown
- [ ] `rst-editor/` - ReStructuredText
- [ ] `task-editor/` - Task management
- [ ] `wiki-editor/` - Wiki pages
- [ ] `x11-editor/` - X11 graphics

### Phase 11: Project Pages ✅ COMPLETED (Oct 28, 2025 - Phase 11a)

**Priority: HIGH** - Core user interface

#### 11a: Projects List Page ✅ COMPLETED

Location: `packages/frontend/projects/`

**Files Modified**:

- `packages/frontend/projects/projects-page.tsx`
- `packages/frontend/projects/projects-table-controls.tsx`
- `packages/frontend/projects/projects-starred.tsx`

**Changes**:

- [x] **projects-page.tsx** - Main projects listing
  - [x] ✅ Page structure: `<main role="main" aria-label="Projects management">`
  - [x] ✅ Filters section: `role="region" aria-label="Project filters and controls"`
  - [x] ✅ Projects list: `aria-label="Projects list ({count} total)"`

- [x] **projects-table-controls.tsx** - Control bar with filters
  - [x] ✅ Search input: `aria-label="Filter projects by name"`
  - [x] ✅ Hashtags filter: `aria-label="Filter projects by hashtags"`
  - [x] ✅ Hidden projects switch: `aria-label="Show hidden projects"`
  - [x] ✅ Deleted projects switch: `aria-label="Show deleted projects"`
  - [x] ✅ Create project button: `aria-label="Create a new project"`

- [x] **projects-starred.tsx** - Starred/favorite projects
  - [x] ✅ Section: `role="region" aria-label="Starred (N)"`
  - [x] ✅ Starred project buttons: `aria-label` with full project title
  - [x] ✅ Overflow dropdown: `aria-label="N more starred project(s)"`

### Phase 9b: Account Preferences - Sub-Sections ✅ COMPLETED (Oct 28, 2025)

**Enhancement: Added region landmarks to account preference sub-sections**

**Component Enhancements**:

- `packages/frontend/antd-bootstrap.tsx` - Panel component now supports `role` and `aria-label` props
- `packages/frontend/components/setting-box.tsx` - SettingBox component now supports `role` and `aria-label` props

**Account Preferences - Appearance** (`packages/frontend/account/account-preferences-appearance.tsx`):

- [x] ✅ **User Interface settings**: `role="region" aria-label="User interface settings"`
- [x] ✅ **Dark mode settings**: `role="region" aria-label="Dark mode settings"`
- [x] ✅ **Editor color scheme**: `role="region" aria-label="Editor color scheme settings"` (via color-schemes.tsx)
- [x] ✅ **Terminal settings**: `role="region" aria-label="Terminal settings"` (via terminal-settings.tsx)

**Account Preferences - Editor** (`packages/frontend/account/editor-settings/editor-settings.tsx`):

- [x] ✅ **Basic editor settings**: `role="region" aria-label="Basic editor settings"`
- [x] ✅ **Keyboard settings**: `role="region" aria-label="Keyboard settings"`

**Account Preferences - Editor Checkboxes** (`packages/frontend/account/editor-settings/checkboxes.tsx`):

- [x] ✅ **Display settings**: `role="region" aria-label="display settings"`
- [x] ✅ **Editing behavior**: `role="region" aria-label="editing behavior"`
- [x] ✅ **Auto-completion**: `role="region" aria-label="auto-completion"`
- [x] ✅ **File operations**: `role="region" aria-label="file operations"`
- [x] ✅ **Jupyter settings**: `role="region" aria-label="jupyter settings"`
- [x] ✅ **UI elements**: `role="region" aria-label="ui elements"`

**Account Preferences - Keyboard** (`packages/frontend/account/keyboard-settings.tsx`):

- [x] ✅ **Keyboard shortcuts**: `role="region" aria-label="Keyboard shortcuts"`

**Account Preferences - Communication** (`packages/frontend/account/account-preferences-communication.tsx`):

- [x] ✅ **Notification settings**: `role="region" aria-label="Notification settings"`

**Account Preferences - Security** (`packages/frontend/account/account-preferences-security.tsx`):

- [x] ✅ Changed main region label from "Security settings" → "API & SSH Keys"
- [x] ✅ **SSH keys**: `role="region" aria-label="SSH keys"` (via global-ssh-keys.tsx)
- [x] ✅ **API keys**: `role="region" aria-label="API keys"` (via api-keys.tsx using enhanced SettingBox)

**Account Preferences - Profile** (`packages/frontend/account/account-preferences-profile.tsx`):

- [x] ✅ **Account settings**: `role="region" aria-label="Account settings"` (via settings/account-settings.tsx)
- [x] ✅ **Avatar settings**: `role="region" aria-label="Avatar settings"` (via profile-settings.tsx)

**Account Preferences - Tours** (`packages/frontend/account/tours.tsx`):

- [x] ✅ **Completed tours**: `role="region" aria-label="Completed tours"`

**Other Settings** (`packages/frontend/account/other-settings.tsx`):

- [x] ✅ **AI settings**: `role="region" aria-label="AI settings"`
- [x] ✅ **Theme settings**: `role="region" aria-label="Theme settings"`
- [x] ✅ **Browser settings**: `role="region" aria-label="Browser settings"`
- [x] ✅ **File explorer settings**: `role="region" aria-label="File explorer settings"`
- [x] ✅ **Projects settings**: `role="region" aria-label="Projects settings"`

#### 11b: Project Page ✅ COMPLETED

Location: `packages/frontend/project/page/`

**Completed** ✅:

- [x] **page.tsx** - Main project workspace
  - [x] Main content area: `<div role="main" aria-label="Content: {currentFilename}">` (line 389-392)
  - [x] Activity bar sidebar: `<aside role="complementary" aria-label="Project activity bar">` (line 356-371)
  - [x] File tabs navigation: `<nav aria-label="Open files">` (line 307-313)
  - [x] Flyout sidebar: `<aside role="complementary" aria-label="Project sidebar">` (line 262-278)

- [x] **Activity Bar** (`activity-bar-tabs.tsx` / `VerticalFixedTabs` component)
  - [x] Container: `role="tablist" aria-label="Project activity tabs"` (line 267-268)
  - [x] Each tab button: `role="tab"`, `aria-selected={isActive}`, `aria-controls="activity-panel-{name}"` (line 230-232)

- [x] **File Tabs** (`file-tabs.tsx` / `FileTabs` component)
  - [x] Container: Ant Design `<Tabs>` with `aria-label="Open files"` (line 167)
  - [x] Tab items: `role="tab"` with `aria-selected={isActive}`, `aria-controls="content-{tabId}"` (Label component)
  - [x] Tab panels: Ant Design Tabs handles tab panel semantics automatically

- [x] **Content Switching** (`content.tsx`)
  - [x] Each content section: `role="tabpanel"` with dynamic `aria-label` based on active tab (line 119-120)
  - [x] Labels cover all tab types: home, files, new, log, search, servers, settings, info, users, upgrades, editor paths

**Files Modified**:

- `packages/frontend/project/page/file-tab.tsx` - Added ARIA props to FileTab component interface and body div
- `packages/frontend/project/page/activity-bar-tabs.tsx` - Added role="tablist" and ARIA attributes to VerticalFixedTabs
- `packages/frontend/project/page/file-tabs.tsx` - Added ARIA props to Label component and Tabs aria-label
- `packages/frontend/project/page/content.tsx` - Added role="tabpanel" with dynamic aria-label labels

#### 11c: Flyouts

Location: `packages/frontend/project/page/flyouts/`

- [ ] **files.tsx** - File explorer
  - [ ] Tree structure: `role="tree"` with tree item semantics
  - [ ] Expandable items: `aria-expanded` and `aria-controls`
  - [ ] Selection: `aria-selected` on selected items
  - [ ] Keyboard support: Arrow keys for navigation

- [ ] **active.tsx** - Open files list
  - [ ] List: `role="list"` with `<li>` items
  - [ ] Current file: `aria-current="true"`
  - [ ] Unsaved indicator: Clear visual + ARIA label

- [ ] **chat.tsx/collabs.tsx** - Chat/collaboration panel
  - [ ] Chat log: `role="log" aria-live="polite"`
  - [ ] Messages: Semantic message structure
  - [ ] Timestamps: `aria-label` or title attribute
  - [ ] Input: Clear label for chat input field

- [ ] **log.tsx** - Project/build log
  - [ ] Log output: `role="region" aria-label="Project log" aria-live="polite"`
  - [ ] Line-by-line navigation: Keyboard support
  - [ ] Scrolling: Announce when scrolling to new content

- [ ] **settings.tsx** - Project settings panel
  - [ ] Form groups: `<fieldset>` with `<legend>`
  - [ ] Settings: Proper form labeling
  - [ ] Status: Save status announcements

### Phase 12: App Shell & Navigation ✅ P0 COMPLETED | P1 PENDING

**Priority: HIGH** - Framework for entire app

Location: `packages/frontend/app/`

#### **P0 - Critical Foundation** ✅ COMPLETED

- [x] **page.tsx** - Main application container
  - [x] Root `<main role="main" aria-label="{site_name} application">` (line 368-369)
  - [x] Dynamic label uses customizable site_name from customize store
  - [x] Fallback to SITE_NAME constant from @cocalc/util/theme
  - [x] Right nav region: `role="region" aria-label="Top navigation controls"` (line 292-293)

- [x] **nav-tab.tsx** - Top navigation tabs with keyboard support
  - [x] NavTab component: Added optional `role` and `aria-label` props
  - [x] Made keyboard accessible: `tabIndex={0}` + `onKeyDown` for Enter/Space
  - [x] Default `role="button"` with override capability
  - [x] Supports all navigation items: Projects, Account, Admin, Help, Sign In

- [x] **connection-indicator.tsx** - Network status live region
  - [x] Status indicator: `role="status"` (line 119)
  - [x] Live region: `aria-live="polite"` to announce connection changes (line 121)
  - [x] Busy state: `aria-busy={true}` when connecting (line 122)
  - [x] Dynamic label: `aria-label={getConnectionLabel()}` showing current state (line 120)
  - [x] Keyboard support: `tabIndex={0}` + Enter/Space activation
  - [x] Added `labels.connected` to i18n/common.ts for proper translation

**Files Modified**:

- `packages/frontend/app/page.tsx` - Root structure with site_name and right-nav region
- `packages/frontend/app/nav-tab.tsx` - ARIA props and keyboard accessibility
- `packages/frontend/app/connection-indicator.tsx` - Status live region with i18n labels
- `packages/frontend/i18n/common.ts` - Added labels.connected

#### **P1 - Important Improvements** ⏳ PENDING

- [ ] **active-content.tsx** - Content router
  - [ ] Dynamic content: Announce when switching pages
  - [ ] Loading states: `aria-busy` indication
  - [ ] Error states: ARIA alert or live region

- [ ] **Banners** - Informational/warning banners (5 files)
  - [ ] All banners: `role="region" aria-label="..."`
  - [ ] `i18n-banner.tsx` - Language selection
  - [ ] `verify-email-banner.tsx` - Email verification
  - [ ] `version-warning.tsx` - Version alerts
  - [ ] `insecure-test-mode-banner.tsx` - Test mode warning
  - [ ] `warnings.tsx` - Cookie/storage warnings

- [ ] **Notifications** - Notification indicators
  - [ ] Notification badges: `aria-label` with count
  - [ ] Live region: `aria-live="polite"` for count changes

- [ ] **projects-nav.tsx** - Project tabs navigation
  - [ ] Container: `aria-label="Open projects"`
  - [ ] Tab semantics already handled by Ant Design Tabs

### Phase 13: Forms & Settings ⏳ PENDING

**Priority: MEDIUM**

- [ ] **Profile Settings** (`account/profile-settings.tsx`)
  - [ ] Form structure: Proper `<label>` elements
  - [ ] Image upload: Clear button/input labels
  - [ ] Save button: `aria-label="Save profile"`

- [ ] **SSH Keys** (`account/ssh-keys/`)
  - [ ] Key list: `role="list"` structure
  - [ ] Key items: Truncated key + description
  - [ ] Add/delete buttons: Clear labels
  - [ ] Form for new keys: Proper fieldset/legend

- [ ] **API Keys** (`account/settings/api-keys.tsx`)
  - [ ] Key list: Table or list semantics
  - [ ] Visibility toggle: `aria-pressed` state
  - [ ] Copy button: State changes (Copy → Copied)

- [ ] **Project Settings** (`project/settings/`)
  - [ ] Settings form: `<fieldset>` groups
  - [ ] Input fields: Associated `<label>` elements
  - [ ] Selection: Dropdown/select aria-labels
  - [ ] Radio buttons: `fieldset role="group"` with `<legend>`
  - [ ] Checkboxes: Clear group labels

### Phase 14: Tables & Data Display ⏳ PENDING

**Priority: MEDIUM**

- [ ] **Data Tables** (Generic)
  - [ ] Table role: `role="grid"` or semantic `<table>`
  - [ ] Headers: `<th scope="col">` for columns, `scope="row"` for row headers
  - [ ] Sort buttons: `aria-sort="ascending|descending|none|other"`
  - [ ] Cell content: Descriptive alt text for icons/abbreviations

- [ ] **Purchases Table** (`purchases/purchases.tsx`)
  - [ ] Product list: Table with proper headers
  - [ ] Price/quantity: Clear column purposes
  - [ ] Actions: Purchase buttons with clear labels

- [ ] **Subscriptions Table** (`purchases/subscriptions.tsx`)
  - [ ] Active subscriptions: Mark current status visually + ARIA
  - [ ] Renewal dates: Clear formatting
  - [ ] Cancel buttons: Confirmation dialogs

### Phase 15: Modals & Dialogs ⏳ PENDING

**Priority: MEDIUM**

- [ ] **Settings Modal** (`app/settings-modal.tsx`)
  - [ ] Focus trap: Trap focus inside modal
  - [ ] Close button: `aria-label="Close settings"`
  - [ ] Title: Proper heading for modal purpose
  - [ ] Form: Proper form structure within modal

- [ ] **Confirmation Dialogs** (`app/popconfirm-modal.tsx`)
  - [ ] Message: Clear confirmation text
  - [ ] Buttons: `aria-label="Confirm action"`, `aria-label="Cancel"`
  - [ ] Escape key: Support to dismiss

- [ ] **File Dialogs** (`project/explorer/`)
  - [ ] Ask Filename dialog: Input with label, button
  - [ ] Directory selector: Keyboard navigation support
  - [ ] Confirm: Clear action buttons

### Phase 16: Component Library ⏳ PENDING

**Priority: MEDIUM** - Widely used across frontend

Location: `packages/frontend/components/`

- [ ] **Icon** (`icon.tsx` - 25KB)
  - [ ] Usage audit: Find all icon-only uses without aria-label
  - [ ] Add: `aria-label` to all interactive icons
  - [ ] Decorative: Add `aria-hidden="true"` where appropriate

- [ ] **Buttons**
  - [ ] Copy Button (`copy-button.tsx`)
    - [ ] ✅ State changes already labeled
    - [ ] [ ] Ensure aria-live working

  - [ ] Refresh Button (`refresh.tsx`)
    - [ ] ✅ Basic label present
    - [ ] [ ] Verify aria-busy state

  - [ ] Close Button (`close-x.tsx`, `close-x2.tsx`)
    - [ ] ✅ Already converted to semantic buttons
    - [ ] [ ] Audit all uses for proper labels

- [ ] **Form Inputs**
  - [ ] Search Input (`search-input.tsx`)
    - [ ] ✅ Basic label present
    - [ ] [ ] Help text association

  - [ ] Text Input (`text-input.tsx`)
    - [ ] ✅ Label present
    - [ ] [ ] Error indication: aria-invalid, aria-describedby

  - [ ] Select/Dropdown (`selector-input.tsx`)
    - [ ] Label: `<label>` or aria-label
    - [ ] Options: Clear option labels
    - [ ] Current selection: Announcement on change

  - [ ] Date/Time Picker (`date-time-picker.tsx`)
    - [ ] Input: Clear label with format
    - [ ] Calendar: Keyboard navigation (arrows, Enter)
    - [ ] Selected date: aria-current="date" when selected

  - [ ] Color Picker (`color-picker.tsx`)
    - [ ] Input field: Accessible label
    - [ ] Palette: Keyboard navigation
    - [ ] Selected color: aria-current indication

- [ ] **Tables**
  - [ ] Table of Contents (`table-of-contents.tsx`)
    - [ ] List structure: `role="list"`
    - [ ] Expandable: `aria-expanded` on collapsible items

  - [ ] Scrollable List (`scrollable-list.tsx`)
    - [ ] Container: `role="list"`
    - [ ] Items: `role="listitem"`
    - [ ] Selection: `aria-selected` on items

  - [ ] Data Grid (`data-grid/`)
    - [ ] Grid: `role="grid"` structure
    - [ ] Cells: Keyboard navigation (arrows)
    - [ ] Headers: `scope` attribute
    - [ ] Selection: `aria-selected` states

- [ ] **Alerts & Status**
  - [ ] Error Display (`error-display.tsx`)
    - [ ] Container: `role="alert"`
    - [ ] Message: Clear error text

  - [ ] Loading (`loading.tsx`)
    - [ ] Spinner: `aria-busy="true"` on parent
    - [ ] Message: `aria-label="Loading..."`

  - [ ] Tip/Help (`tip.tsx`)
    - [ ] Container: `role="region" aria-label="Information"`
    - [ ] Icon: Decorative `aria-hidden="true"`

### Phase 17: Keyboard Navigation ⏳ PENDING

**Priority: MEDIUM** - Enhancement across all components

- [ ] **Tab Order Management**
  - [ ] Audit tab order in complex pages
  - [ ] Fix focus management issues
  - [ ] `tabindex="-1"` for programmatically focused elements

- [ ] **Keyboard Shortcuts**
  - [ ] Document keyboard shortcuts
  - [ ] Add keyboard hint to icon buttons
  - [ ] Escape key: Close modals/menus/flyouts
  - [ ] Arrow keys: Navigate lists, menus, tabs
  - [ ] Enter/Space: Activate buttons, toggle checkboxes

- [ ] **Focus Management**
  - [ ] Focus trap: Modals, dropdowns
  - [ ] Focus restoration: After modal closes
  - [ ] Focus announcement: Skip links (if needed)
  - [ ] Focus visible: CSS for keyboard users

### Phase 18: Live Regions & Announcements ⏳ PENDING

**Priority: MEDIUM** - Dynamic content

- [ ] **Status Updates**
  - [ ] Save status: File saved, unsaved changes
  - [ ] Connection status: Connected, disconnected, connecting
  - [ ] Build status: Building, complete, errors
  - [ ] Implementation: Use `aria-live="polite"` or `aria-live="assertive"`

- [ ] **Notifications**
  - [ ] Success messages: `aria-live="polite"`
  - [ ] Error alerts: `aria-live="assertive" role="alert"`
  - [ ] Info messages: `aria-live="polite"`

- [ ] **Loading States**
  - [ ] Indicator: `aria-busy="true"` on container
  - [ ] Message: "Loading... please wait"
  - [ ] Progress: `aria-valuenow`, `aria-valuemin`, `aria-valuemax`

### Phase 19: Compute Servers UI ⏳ PENDING

**Priority: LOW** - Advanced feature

Location: `packages/frontend/compute/`

- [ ] **Compute Servers List** (`compute-servers.tsx`)
  - [ ] List structure: `role="list"`
  - [ ] Server items: Clear status indicators
  - [ ] Actions menu: ARIA menu structure

- [ ] **Server Details** (`compute-server.tsx`)
  - [ ] Tabs: Proper tab structure
  - [ ] Forms: Fieldset/legend for groups
  - [ ] Status indicators: aria-live updates

- [ ] **Google Cloud Config** (`google-cloud-config.tsx` - 56KB)
  - [ ] Form structure: Nested fieldsets/legends
  - [ ] Inputs: Proper labeling
  - [ ] Help text: aria-describedby

### Phase 20: Course Management UI ⏳ PENDING

**Priority: LOW** - Feature-specific

Location: `packages/frontend/course/`

- [ ] **Course Configuration** (`configuration/`)
  - [ ] Settings form: Proper structure
  - [ ] Tabs/sections: Clear navigation

- [ ] **Assignments** (`assignments/`)
  - [ ] List: `role="list"` structure
  - [ ] Due dates: Clear presentation
  - [ ] Grading: Status indicators

- [ ] **Students** (`students/`)
  - [ ] Student list: Table or list structure
  - [ ] Selection: Batch operations
  - [ ] Status: Grade/submission indicators

### Phase 21: Chat & Messaging ⏳ PENDING

**Priority: MEDIUM** - User-facing feature

Location: `packages/frontend/chat/`

- [ ] **Chat Log** (`chat-log.tsx`)
  - [ ] Container: `role="log"` with `aria-live="polite"`
  - [ ] Messages: Proper message structure
  - [ ] Timestamps: Hidden labels or title attributes

- [ ] **Message** (`message.tsx` - 32KB)
  - [ ] Author info: Semantic markup
  - [ ] Links: Proper `<a>` tags with href
  - [ ] Code blocks: `<pre>` with syntax highlight labels
  - [ ] Reactions: Icon + text or alt text
  - [ ] Edited indicator: Clear to screen readers

- [ ] **Input** (`input.tsx`)
  - [ ] Text field: `<textarea>` or `<input>` with `<label>`
  - [ ] Submit: Clear send button label
  - [ ] Attachments: File upload button label
  - [ ] Formatting: Toolbar with aria-labels

- [ ] **Mentions/Notifications**
  - [ ] Unread count: Badge with aria-label
  - [ ] New message: Announcement with aria-live

### Phase 22: Billing & Purchases ⏳ PENDING

**Priority: LOW** - Secondary feature

Location: `packages/frontend/purchases/`

- [ ] **Purchases Page** (`purchases.tsx` - 37KB)
  - [ ] Product list: Table or grid
  - [ ] Price display: Clear currency/unit
  - [ ] Add to cart: Clear action buttons
  - [ ] Cart: Summary with quantities

- [ ] **Subscriptions** (`subscriptions.tsx`)
  - [ ] Active subscriptions: Status indication
  - [ ] Renewal info: Clear dates and costs
  - [ ] Cancel: Warning dialog

- [ ] **Payments** (`payments.tsx`)
  - [ ] Transaction list: Table structure
  - [ ] Details: Expandable rows
  - [ ] Filtering: Clear filter labels

- [ ] **Balance** (`balance.tsx`, `balance-button.tsx`)
  - [ ] Amount: Clear label and currency
  - [ ] Update time: Timestamp clarity
  - [ ] Button: `aria-label="Account balance: ${amount}"`

---

## ARIA Label Conciseness Improvements

Screen reader verbosity is a significant factor in usability. Labels should be concise while still being meaningful. Updated labels in all implementation phases to use shorter, more direct wording:

### Shortened Labels Pattern

- `"Editor frames split vertically: ${path}"` → `"Vertical split: ${path}"`
- `"Editor frames split horizontally: ${path}"` → `"Horizontal split: ${path}"`
- `"Text editor: ${path}"` → `"Editor: ${path}"`
- `"PDF preview: ${path} (${pages} pages)"` → `"PDF (${pages}p): ${path}"`
- `"Table of contents: ${path}"` → `"Contents: ${path}"`
- `"Build output: ${path}"` → `"Build log: ${path}"`
- `"Errors and warnings: ${path} (X errors, Y warnings)"` → `"Issues (${e}e ${w}w): ${path}"`
- `"LaTeX output: ${path}"` → `"Output: ${path}"`
- `"Output files: ${path}"` → `"Files: ${path}"`
- `"Statistics: ${path}"` → `"Stats: ${path}"`
- `"Projects management"` → `"Projects"`
- `"Project filters and controls"` → `"Controls"`
- `"Projects list (N projects total)"` → `"N project(s)"`
- `"Search projects and files"` → `"Search"`
- `"Starred projects (N)"` → `"Starred (N)"`

### Rationale

- Shorter labels reduce cognitive load for screen reader users
- Conciseness improves navigation speed
- Context (file path, file type) is still preserved in the label
- Abbreviations (e.g., "e" for errors, "w" for warnings, "p" for pages) are clear in context

### Modified Files

- `packages/frontend/frame-editors/frame-tree/frame-tree.tsx`
- `packages/frontend/frame-editors/code-editor/codemirror-editor.tsx`
- `packages/frontend/frame-editors/latex-editor/output.tsx`
- `packages/frontend/frame-editors/latex-editor/output-files.tsx`
- `packages/frontend/frame-editors/latex-editor/output-stats.tsx`
- `packages/frontend/projects/projects-page.tsx`
- `packages/frontend/projects/filename-search.tsx`
- `packages/frontend/projects/projects-starred.tsx`

## LaTeX Output Tab Navigation Annotation

The LaTeX editor output panel contains a tab bar for switching between different output views (PDF, Contents, Files, Build log, Issues, Stats). This navigation bar is now properly annotated:

### Implementation

**File**: `packages/frontend/frame-editors/latex-editor/output.tsx` (Tabs component, line 645-646)

```tsx
<Tabs
  // ... other props ...
  role="navigation"
  aria-label={`Output tabs: ${path}`}
/>
```

### What This Provides

- **Landmark Navigation**: Screen reader users can navigate to the tab bar as a distinct landmark
- **Context**: The label includes the file path so users know which file's output tabs they're navigating
- **Clear Purpose**: `role="navigation"` explicitly marks this as navigation, not generic content

### Benefits

- Screen reader users can jump directly to output tabs using landmark navigation
- Tab switching is properly announced as a navigation action
- Multiple LaTeX output panels in split editors can be distinguished by their file paths

## LaTeX PDF Controls Accessibility Enhancements

The LaTeX editor output panel has a control bar with build, sync, and zoom controls. The entire controls section and individual controls have been annotated with proper ARIA landmarks and labels for screen reader users.

### PDFControls Container ✅

**File**: `packages/frontend/frame-editors/latex-editor/output-control.tsx` (line 106-110)

```tsx
<div
  role="region"
  aria-label="PDF controls"
  // ... other props
>
```

**Annotations**:

- Main container: `role="region"` with `aria-label="PDF controls"`
- Makes the entire controls section discoverable as a landmark
- Screen reader users can jump directly to PDF controls

### Individual Sub-Control Region Landmarks

Each of the four sub-control components now has its own region landmark:

#### 1. Build Controls ✅

**File**: `packages/frontend/frame-editors/latex-editor/output-control-build.tsx` (line 140)

```tsx
<div role="region" aria-label="Build controls">
  <Dropdown.Button aria-label="Build menu" />
  <BSButton aria-label="..." aria-pressed={...} />  {/* Dark mode toggle */}
</div>
```

**Annotations**:

- Container: `role="region"` with `aria-label="Build controls"`
- Dropdown button: `aria-label="Build menu"`
- Dark mode toggle: `aria-label` with translated text + `aria-pressed` for state

#### 2. Page Navigation ✅

**File**: `packages/frontend/frame-editors/latex-editor/output-control-pages.tsx` (line 91)

```tsx
<div style={CONTROL_PAGE_STYLE} role="region" aria-label="Page navigation">
  <InputNumber />
  <Button aria-label="Previous page" disabled={...} />
  <Button aria-label="Next page" disabled={...} />
</div>
```

**Annotations**:

- Container: `role="region"` with `aria-label="Page navigation"`
- Buttons announce page direction and enabled/disabled state

#### 3. Sync Controls ✅

**File**: `packages/frontend/frame-editors/latex-editor/output-control-sync.tsx` (line 175-178)

```tsx
<div role="region" aria-label="Sync controls">
  <BSButton aria-label="..." aria-pressed={autoSyncInverse} />
  <BSButton aria-label="..." aria-pressed={autoSyncForward} />
  <BSButton aria-label="..." /> {/* Manual sync */}
</div>
```

**Annotations**:

- Container: `role="region"` with `aria-label="Sync controls"`
- All buttons have aria-labels with translated tooltip text
- Toggle buttons have `aria-pressed` for state

#### 4. Zoom Controls ✅

**File**: `packages/frontend/frame-editors/latex-editor/output-control-zoom.tsx` (line 202)

```tsx
<div role="region" aria-label="Zoom controls">
  <Space.Compact>
    <Button aria-label="Zoom in" />
    <Button aria-label="Zoom out" />
    <Button
      aria-label={`Zoom: ${currentZoomPercentage}%`}
      aria-haspopup="menu"
    />
  </Space.Compact>
</div>
```

**Annotations**:

- Container: `role="region"` with `aria-label="Zoom controls"`
- Zoom in/out buttons: simple translated labels
- Zoom percentage dropdown: includes current value + `aria-haspopup="menu"`

### Landmark Structure Summary

The complete hierarchy is now:

```
main: PDFControls
├── region: PDF controls (container)
│   ├── region: Build controls
│   ├── region: Page navigation (if totalPages > 0)
│   ├── region: Sync controls
│   └── region: Zoom controls
│
└── navigation: Output tabs
```

\*\*Build Controls

```tsx
<Dropdown.Button
  // ... other props ...
  aria-label="Build menu"
/>

<BSButton
  // ... other props ...
  aria-label={intl.formatMessage(editor.toggle_pdf_dark_mode_title)}
  aria-pressed={pdfDarkModeDisabled}
/>
```

**Annotations**:

- Build dropdown button: `aria-label="Build menu"` (accessible button label)
- Dark mode toggle: `aria-label` with translated text + `aria-pressed` for toggle state

### Sync Controls

**File**: `packages/frontend/frame-editors/latex-editor/output-control-sync.tsx`

```tsx
<BSButton
  // Inverse sync toggle ...
  aria-label={intl.formatMessage(INVERSE_SYNC_TOOLTIP_MSG)}
  aria-pressed={autoSyncInverse}
/>

<BSButton
  // Forward sync toggle ...
  aria-label={intl.formatMessage(FORWARD_SYNC_TOOLTIP_MSG)}
  aria-pressed={autoSyncForward}
/>

<BSButton
  // Manual sync button ...
  aria-label={intl.formatMessage(SYNC_BUTTON_TOOLTIP_MSG)}
/>
```

**Annotations**:

- All sync buttons use internationalized labels from tooltip messages
- Toggle buttons (`aria-pressed`) for forward/inverse sync state
- Manual sync button with clear action label

### Zoom Controls

**File**: `packages/frontend/frame-editors/latex-editor/output-control-zoom.tsx`

```tsx
<Button
  // Zoom in ...
  aria-label={intl.formatMessage(labels.zoom_in)}
/>

<Button
  // Zoom out ...
  aria-label={intl.formatMessage(labels.zoom_out)}
/>

<Button
  // Zoom dropdown ...
  aria-label={`Zoom: ${currentZoomPercentage}%`}
  aria-haspopup="menu"
/>
```

**Annotations**:

- Zoom in/out buttons: explicit labels from i18n
- Zoom percentage dropdown: includes current zoom value + `aria-haspopup="menu"`

### Benefits

- Icon-only buttons now have clear accessible labels via `aria-label`
- Toggle buttons properly announce their state via `aria-pressed`
- Dropdown menus properly indicate they have nested content via `aria-haspopup`
- All labels use internationalized text for multi-language support
- Screen reader users can quickly understand and operate all PDF controls

## Component Library Quick Accessibility Wins

Several commonly used components received quick but impactful ARIA accessibility improvements:

### Close Buttons (CloseX and CloseX2) ✅

**Files**: `packages/frontend/components/close-x.tsx`, `packages/frontend/components/close-x2.tsx`

**Changes**:

- Replaced non-semantic `<a href="">` and `<div onClick>` with proper `<button type="button">`
- Added `aria-label="Close"` to provide accessible description
- Added button style resets to maintain appearance: `border: "none"`, `background: "transparent"`, `padding: 0`
- Ensures button looks identical to original anchor/div implementation
- Maintains CSS classes and styling (e.g., `pull-right`, `lighten`)

**Code Examples**:

```tsx
// CloseX
const closex_style: React.CSSProperties = {
  float: "right",
  marginLeft: "5px",
  border: "none", // Reset button default border
  background: "transparent", // Remove button background
  padding: 0, // Remove button padding
  cursor: "pointer",
} as const;

// CloseX2
const DEFAULT_STYLE: CSS = {
  cursor: "pointer",
  fontSize: "13pt",
  border: "none", // Reset button default border
  background: "transparent", // Remove button background
  padding: 0, // Remove button padding
};
```

**Impact**: Close buttons used throughout UI are now keyboard-accessible and properly announced, with zero visual changes

### Copy Button ✅

**File**: `packages/frontend/components/copy-button.tsx`

**Changes**:

- Added `aria-label` that changes based on state: "Copy to clipboard" / "Copied"
- Added `aria-live="polite"` to announce state changes to screen readers

**Code**:

```tsx
<Button
  aria-label={copied ? "Copied" : "Copy to clipboard"}
  aria-live="polite"
>
```

**Impact**: State changes now properly announced; users know when copy succeeded

### Refresh Button ✅

**File**: `packages/frontend/components/refresh.tsx`

**Changes**:

- Added `aria-label="Refresh"` for clear button purpose
- Added `aria-busy={refreshing}` to announce when refresh is in progress

**Code**:

```tsx
<Button
  aria-label="Refresh"
  aria-busy={refreshing}
>
```

**Impact**: Users know button is processing and when operation completes

### Mark All Button ✅

**File**: `packages/frontend/components/mark-all.tsx`

**Changes**:

- Added `aria-label={`Mark all items as ${capitalize(how)}`}` for explicit action description

**Impact**: Action is clear even with icon-only display; works with "read", "unread", "seen", "unseen" states

## Form Components Accessibility Improvements

Four commonly used form input components received ARIA accessibility enhancements:

### Number Input ✅

**File**: `packages/frontend/components/number-input.tsx`

**Changes**:

- Added `aria-label` that includes unit information: `"Enter number in {unit}"` when unit is provided
- Added `aria-describedby` linking to constraints when min/max bounds are defined

**Code**:

```tsx
<Input
  aria-label={`Enter number${props.unit ? ` in ${props.unit}` : ""}`}
  aria-describedby={
    props.min != null || props.max != null
      ? "number-input-constraints"
      : undefined
  }
/>
```

**Impact**: Users know the expected input format and any constraints (min/max values)

### Text Input ✅

**File**: `packages/frontend/components/text-input.tsx`

**Changes**:

- Added `aria-label` to input field distinguishing between text and textarea
- Added `aria-label="Save changes"` to the Save button for explicit action label

**Impact**: Users know which input they're in and that the button saves their changes

### Search Input ✅

**File**: `packages/frontend/components/search-input.tsx`

**Changes**:

- Added `aria-label="Search"`
- Added `aria-describedby` linking to help text about keyboard shortcuts (Enter, Esc, arrow keys)

**Impact**: Search purpose is clear; users can discover keyboard shortcuts via screen readers

### Date/Time Picker ✅

**File**: `packages/frontend/components/date-time-picker.tsx`

**Changes**:

- Added `aria-label` that uses placeholder text or defaults to "Select date and time"
- Added `aria-describedby` linking to date format description (e.g., "YYYY-MM-DD HH:mm Z")

**Impact**: Users know the expected date/time format and can understand picker behavior

## Editor Menu Accessibility Enhancements

While Ant Design's `Button`, `Dropdown`, and `Menu` components provide built-in ARIA support (`role="button"`, `aria-haspopup="menu"`, `aria-expanded`), additional enhancements improve screen reader experience:

### Improvements Made:

#### 1. Menu Button Labels ✅ IMPLEMENTED

- Added explicit `aria-label` to DropdownMenu trigger buttons
- Pattern: `aria-label={`${title} menu`}`
- Example: "File menu", "Edit menu", "View menu"
- **File**: `packages/frontend/components/dropdown-menu.tsx`
- **Benefit**: Screen readers now explicitly announce menu button purpose (e.g., "File menu", "Edit menu")

#### 2. Menu Item Labels with Keyboard Shortcuts

- Menu items include keyboard shortcuts in `aria-label`
- Pattern: `aria-label="Save (Ctrl+S)"`
- Screen readers announce the shortcut with the command
- **Status**: ⏳ Future enhancement - Requires refactoring ManageCommands to extract shortcuts from Command metadata
- **Files**: `packages/frontend/frame-editors/frame-tree/title-bar.tsx`, `packages/frontend/frame-editors/frame-tree/commands.ts`

#### 3. Toggle Button State Annotations

- Buttons with toggle state include `aria-pressed` attribute
- Pattern: `aria-pressed={isEnabled}` combined with `aria-label="Build on save"`
- Screen readers announce: "Build on save, pressed" or "Build on save, not pressed"
- Examples: Build on Save, Autosave, Time Travel enabled/disabled
- **Status**: ⏳ Future enhancement - Requires state tracking in ManageCommands.menuItem() method
- **Files**: `packages/frontend/frame-editors/frame-tree/title-bar.tsx`

### Technical Details:

**DropdownMenu Component** (`packages/frontend/components/dropdown-menu.tsx`):

- Added `aria-label={`${title} menu`}` to the Button trigger
- Preserves Ant Design's automatic ARIA handling
- Improves discoverability for screen reader users

**Menu Items** (generated in `title-bar.tsx`):

- Command menu items receive labels like: "Save (Ctrl+S)", "Undo (Ctrl+Z)"
- Toggle items show state: "Build on save (enabled)" or "Build on save (disabled)"
- Reduces cognitive load by announcing available shortcuts

### Why This Matters:

- Screen reader users can't see menu button purpose or state at a glance
- Keyboard shortcuts are invisible to assistive technology
- Toggle states help users understand current configuration without examining UI
- Explicit labels make menu navigation more predictable and faster

## Jupyter Notebook Cell Controls

### Cell Buttonbar ✅

**File**: `packages/frontend/jupyter/cell-buttonbar.tsx`

**Changes**:

- Added `role="region" aria-label={`Cell ${index + 1} controls`}` to main container (1-indexed for user-friendly display)
- Enhanced Run/Stop dropdown button with comprehensive aria-label: `${label} cell${isRunning ? " (running)" : ""}, dropdown menu: run all above, run all below`
  - Describes the primary action (Run or Stop)
  - Announces current cell state (running or idle)
  - Lists available menu options so users know what the dropdown contains
  - Includes `aria-haspopup="menu"` to announce dropdown availability
- Added `aria-label="Format code"` and `aria-busy={formatting}` to Format button
- Added `aria-label={editing ? "Save markdown" : "Edit markdown"}` to Markdown edit button

**Impact**: Each cell's controls are announced as a distinct region. Users can navigate between cells and understand their current functionality. Toggle buttons announce their state via aria-busy (formatting in progress) and edit status changes.

**Landmark Structure**:

```
region: Cell 1 controls
├── button: Run menu (aria-haspopup="menu")
│   └── menu items: Run all above, Run all below
├── button: Format code (aria-busy when formatting)
└── button: Edit markdown (state-aware label)

region: Cell 2 controls
├── button: Run menu
├── button: Format code
└── button: Edit markdown
```

**Code Pattern**:

```tsx
// In getRunStopButton(), calculate isRunning state
const isRunning =
  cell.get("state") === "busy" ||
  cell.get("state") === "run" ||
  cell.get("state") === "start";

// Return isRunning along with other button properties
return {
  tooltip: "...",
  label: "Run" | "Stop",
  icon: "...",
  isRunning, // Boolean indicating if cell is running
  onClick: () => {
    /* ... */
  },
};

// In renderCodeBarRunStop(), destructure isRunning from getRunStopButton()
const { label, icon, tooltip, onClick, isRunning } = getRunStopButton();

// Use isRunning in aria-label to show current cell state
<div role="region" aria-label={`Cell ${index + 1} controls`}>
  <Dropdown.Button
    aria-label={`${label} cell${isRunning ? " (running)" : ""}, dropdown menu: run all above, run all below`}
    aria-haspopup="menu"
  >
    {/* Run/Stop button - label describes current action, cell state, and menu options */}
  </Dropdown.Button>

  <Button aria-label="Format code" aria-busy={formatting}>
    {/* Format button */}
  </Button>

  <Button aria-label={editing ? "Save markdown" : "Edit markdown"}>
    {/* Markdown edit toggle */}
  </Button>
</div>;
```

**Technical Notes**:

- Each cell gets its own control region with a numerical identifier for context
- The Run/Stop dropdown uses aria-haspopup to announce menu availability
- Format button uses aria-busy to indicate when formatting is in progress
- Markdown button label changes based on current edit state for dynamic feedback
- Cell timing, compute server info, and LLM tools are contained within this region

## Implementation Notes

### Phase 10 Completion (2025-10-28)

**Components Enhanced**:

1. **title-bar.tsx** (38KB)
   - `renderMainMenusAndButtons()`: Changed div to `<nav>` with aria-label for menu navigation
   - `renderButtonBar()`: Added `role="region"` with aria-label for symbols/outline bar
   - `renderFrameControls()`: Added `role="region"` with aria-label for layout controls
   - `render_full()`: Added aria-label to maximize/minimize button
   - `render_split_row()`: Added aria-label to horizontal split button
   - `render_split_col()`: Added aria-label to vertical split button
   - `render_x()`: Added aria-label to close button
   - `allButtonsPopover()`: Added aria-label and aria-expanded to more commands button
   - `renderConnectionStatus()`: Added aria-live="polite" and aria-label for connection status

2. **editor.tsx**
   - Main container: Added `role="application"` with context-aware aria-label including editor type and file path

3. **status-bar.tsx**
   - Main container: Added `role="status"`, `aria-live="polite"`, and `aria-atomic="true"`
   - Clear button: Made keyboard accessible with keyboard handler

4. **Icon Component Enhancement** (components/icon.tsx)
   - Added ARIA attribute support to Icon component:
     - `role`, `aria-label`, `aria-expanded`, `aria-pressed`, `aria-live`, `aria-atomic`, `tabIndex`, `onKeyDown`
   - Updated both unicode and icon rendering paths to pass through ARIA attributes
   - Enables Icon component to be used with roles like "button" and dynamic ARIA state

**Build Status**: ✅ Build successful (pnpm build-dev in packages/static)

### Best Practice Notes

1. **Direct ARIA on Components**: When Ant Design components (Space.Compact, Button, etc.) support ARIA attributes, apply them directly without wrapping in divs:
   - ✅ `<Space.Compact role="region" aria-label="Zoom controls">`
   - ❌ `<div role="region"><Space.Compact>` (unnecessary nesting)

2. **Component Props Support**: All frontend components should be checked to ensure they forward ARIA attributes to their DOM elements. The Icon component was enhanced to support ARIA props for broader accessibility support.

3. **Live Regions**: Use `aria-live="polite"` for status updates and `aria-live="assertive"` only for urgent alerts. Always test with screen readers to ensure announcements are clear.

## Session Summary - October 28, 2025

### Session Accomplishments

**Phases Completed**:

- ✅ Phase 11a: Projects List Page (Complete)
- ✅ Phase 9b: Account Preferences Sub-Sections (Complete)

**Component Enhancements**:

1. **Panel** (`antd-bootstrap.tsx`) - Now supports ARIA region props
   - Added `role` and `aria-label` parameters
   - Enables Panel components throughout app to declare landmark regions

2. **SettingBox** (`components/setting-box.tsx`) - Now supports ARIA region props
   - Added `role` and `aria-label` parameters
   - Direct ARIA support on component (not wrapped in divs)

**Projects List Page (Phase 11a)**:

- Main workspace landmark with "Projects management" label
- Project filters section with descriptive "Project filters and controls" label
- Dynamic projects list label showing count: "Projects list (N total)"
- All controls (search, filters, buttons) have clear aria-labels
- Starred projects section with count indicator

**Account Preferences Sub-Sections (Phase 9b)**:

- Enhanced all account preference panels with region landmarks
- 25+ sub-sections now have clear accessibility labels
- Consistent naming pattern for easy navigation
- Components used directly with ARIA props (no wrapper divs)

**Sub-Sections Labeled**:

- Appearance: User Interface, Dark Mode, Editor Color Scheme, Terminal
- Editor: Basic Settings, Keyboard, Display, Editing Behavior, Auto-completion, File Operations, Jupyter, UI Elements
- Keyboard: Keyboard Shortcuts
- Communication: Notification Settings
- Security: API Keys, SSH Keys (renamed from "Security settings")
- Profile: Account Settings, Avatar Settings
- Tours: Completed Tours
- Other: AI, Theme, Browser, File Explorer, Projects

**Files Modified**: 30+ files

- Core: 2 component enhancements
- Projects: 3 files
- Account Preferences: 25+ files across all preference categories

### Next Steps

**Phase 11b: Project Page** - Ready to start

- Main project workspace layout
- Activity bar with tab semantics
- File tabs navigation
- Content area routing

**Phase 12: App Shell & Navigation** - Pending

- Top-level navigation structure
- Connection status indicators
- Notification management

**Phase 13+**: Form fields, tables, modals, etc.
