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

### Pattern: Keyboard Accessibility for Custom Interactive Elements

When creating interactive elements with `role="button"`, `role="tab"`, or other interactive roles using `<div>` or other non-button elements, you must provide keyboard support via the `ariaKeyDown` utility from `@cocalc/frontend/app/aria`.

**Why this is needed:**

- Native `<button>` elements support Enter and Space keys automatically
- Custom elements with `role="button"` do not have native keyboard support
- Screen reader users and keyboard-only users rely on this keyboard behavior

**Usage pattern:**

```tsx
import { ariaKeyDown } from "@cocalc/frontend/app/aria";

// For button-like divs
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={ariaKeyDown(handleClick)}
  aria-label="Delete item"
>
  Delete
</div>

// For tab-like divs
<div
  role="tab"
  tabIndex={0}
  onClick={handleSelect}
  onKeyDown={ariaKeyDown(handleSelect)}
  aria-selected={isActive}
>
  Tab label
</div>
```

**What ariaKeyDown does:**

- Activates the handler when Enter or Space keys are pressed
- Prevents default browser behavior (form submission, page scroll)
- Provides the same keyboard experience as native buttons
- Single source of truth for this common accessibility pattern

**Implementation note:**
Always use `ariaKeyDown` when you have:

- `role="button"`, `role="tab"`, or other interactive roles on non-button elements
- An `onClick` handler that should also work with keyboard
- A `tabIndex={0}` to make the element focusable

See `packages/frontend/app/aria.tsx` for the implementation and usage in:

- `packages/frontend/app/nav-tab.tsx` - Navigation tabs
- `packages/frontend/app/connection-indicator.tsx` - Status indicator
- `packages/frontend/app/notifications.tsx` - Notification badges
- `packages/frontend/frame-editors/frame-tree/status-bar.tsx` - Status bar close button

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

### ✅ Completed Areas

The following areas have been successfully implemented with ARIA landmarks and labels:

#### Phases 1-8: Core Components ✅

- Application shell and project workspace
- Frame tree split editors with vertical/horizontal indicators
- Editor title bars and toolbars
- Jupyter notebook cells with status
- LaTeX editor with multi-region controls
- Code editor with text editor regions
- Projects list with filters and search

#### Phases 9-12: Extended Coverage ✅

- Account settings pages (10+ files)
- Editor frame infrastructure with keyboard support
- Project page workspace with activity bar
- App shell & navigation with connection status

**Key Achievements**:

- 100+ files modified with proper ARIA roles and labels
- Frame tree with split editor support (vertical/horizontal)
- Live regions for status updates (aria-live="polite")
- Keyboard event handling standardized via `ariaKeyDown()` utility
- Design system colors integrated throughout
- All code formatted and builds successfully

See git history for detailed implementation of each phase.

## Pending Phases (13-22)

These phases outline areas that need further accessibility work. Explore in detail as needed:

| Phase | Focus                                                         | Priority |
| ----- | ------------------------------------------------------------- | -------- |
| 13    | Forms & Settings (fieldsets, legends, proper labels)          | MEDIUM   |
| 14    | Tables & Data Display (grid roles, headers, sort states)      | MEDIUM   |
| 15    | Modals & Dialogs (focus traps, escape handling)               | MEDIUM   |
| 16    | Component Library (icons, buttons, inputs, tables, alerts)    | MEDIUM   |
| 17    | Keyboard Navigation (tab order, shortcuts, focus)             | MEDIUM   |
| 18    | Live Regions & Announcements (status, notifications, loading) | MEDIUM   |
| 19    | Compute Servers UI (lists, details, config)                   | LOW      |
| 20    | Course Management UI (configuration, assignments, students)   | LOW      |
| 21    | Chat & Messaging (chat log, messages, input, mentions)        | MEDIUM   |
| 22    | Billing & Purchases (products, subscriptions, payments)       | LOW      |

---

## Recently Completed (Phases 23-25)

**Phase 23 ✅**: AutoFocus user preference. User-configurable setting in account preferences to disable autoFocus on page inputs while keeping it for modals. Created `useAutoFocusPreference()` hook. Fixed SearchInput focus bug.

**Phase 24 ✅**: Editor content landmark navigation. Full keyboard navigation (Tab/Shift+Tab) between split editor frames. Content landmark focusable via Alt+Shift+M, Return key enters editor. Design system color feedback.

**Phase 25 ✅**: Hotkey quick navigation dialog. Global hotkey (Shift+Shift, Alt+Shift+H, Alt+Shift+Space) with hierarchical tree showing frames, files, pages, account. Multi-term search with visual highlighting. Full keyboard navigation support. Numeric shortcuts: Key 0 toggles side chat, Keys 1–9 focus frames.

---

## SPA Structure & WCAG AA Compliance

### Application Entry Points

CoCalc is a single-page application with this startup flow:

1. **`packages/static/src/app.html`** - Base HTML template with React container div
2. **`packages/static/src/webapp-cocalc.ts`** - Entry point that initializes the app
3. **`packages/frontend/entry-point.ts`** - Initializes Redux stores and app subsystems
4. **`packages/frontend/app/render.tsx`** - Mounts React app to `#cocalc-webapp-container`
5. **`packages/frontend/app/page.tsx`** - Main App component with navigation and layout

Key files implementing WCAG AA compliance:

- `packages/frontend/app/localize.tsx` - Dynamic `lang` attribute on `<html>`
- `packages/frontend/browser.ts` - `set_window_title()` and `set_meta_description()` functions
- `packages/static/src/meta.tsx` - Viewport and meta tags
- `packages/frontend/customize.tsx` - Page description from customization settings

### Running Lighthouse Accessibility Audits

**In Chrome DevTools:**

1. Open your local CoCalc instance (e.g., `http://localhost:5000`)
2. Open DevTools (F12)
3. Go to **Lighthouse** tab
4. Select **Desktop** device
5. Select only **Accessibility** (uncheck Performance, Best Practices, SEO)
6. Click **Analyze page load**
7. Save the report as JSON: click menu → **Save as JSON**

Reports are automatically timestamped (e.g., `localhost_5000-20251113T152932.json`) - save to `dev/` directory.

## Processing Lighthouse JSON Reports

### Extract Summary of Results

```bash
python3 << 'EOF'
import json

with open('dev/localhost_5000-TIMESTAMP.json') as f:
    report = json.load(f)

audits = ['aria-required-parent', 'aria-required-children', 'aria-command-name',
          'image-alt', 'label-content-name-mismatch', 'link-name', 'color-contrast']

print("Lighthouse Accessibility Audit Summary")
print("=" * 70)

for audit_id in audits:
    if audit_id in report['audits']:
        audit = report['audits'][audit_id]
        score = audit.get('score')
        failed = len(audit.get('details', {}).get('failed', []))
        status = "✓ PASS" if score == 1 else f"✗ FAIL ({failed} issues)"
        print(f"{audit_id:35} {status}")
EOF
```

### Extract Failure Details

```bash
python3 << 'EOF'
import json

with open('dev/localhost_5000-TIMESTAMP.json') as f:
    report = json.load(f)

# Change audit_id to inspect a specific audit
audit_id = 'aria-required-parent'
if audit_id in report['audits']:
    failed = report['audits'][audit_id].get('details', {}).get('failed', [])
    print(f"Audit: {audit_id} - {len(failed)} issues\n")
    for item in failed[:5]:
        print(f"Selector: {item['node']['selector']}")
        print(f"Issue: {item['node']['explanation'][:150]}\n")
EOF
```

### Quick jq Inspection

```bash
# List all audit IDs
jq '.audits | keys[]' dev/localhost_5000-TIMESTAMP.json

# Count failures for specific audit
jq '.audits["aria-required-parent"].details.failed | length' dev/localhost_5000-TIMESTAMP.json

# Show failure selectors
jq '.audits["aria-required-parent"].details.failed[].node.selector' dev/localhost_5000-TIMESTAMP.json
```

**Key**: `report['audits'][audit_id]['details']['failed']` contains the failure array with `.node.selector`, `.node.snippet`, and `.node.explanation`.

## Lighthouse Accessibility Audit Results (Desktop)

**Date**: 2025-11-13
**URL**: http://localhost:5000/projects
**Report**: packages/static/lightouse.json

### Failures Found (7 issues)

#. **[color-contrast](https://dequeuniversity.com/rules/axe/4.11/color-contrast)** (14 items) ⚠️ **DEFER**

- Background and foreground colors don't meet WCAG AA ratios (4.5:1 normal, 3:1 large)
- **Plan**: Handle via custom antd theme with 3 options: "Antd (standard)", "Cocalc", "Accessibility"
- Store in preferences/appearance config
- Ignore contrast requirements for ornamental details (e.g., footer)

#. **[aria-required-children](https://dequeuniversity.com/rules/axe/4.11/aria-required-children)** (2 items) 🔄 **IN PROGRESS**

- tablist parent has invalid children (role=button, buttons that should be role=tab)
- Root cause: SortableTab wrapper adds `role="button"` which is invalid inside tablist
- Issue in: Projects nav tabs and file tabs where SortableTab (with dnd-kit) wraps the tab elements
- Solution needed: Adjust SortableTab wrapper to use `role="tab"` or restructure to avoid role conflict

#. **aria-required-parent** (4 items) 🔄 **PENDING VERIFICATION**

- May be auto-fixed by the SortableTab role="tab" change
- Need to run Lighthouse again to verify

After all fixes:

- ✅ aria-command-name: PASS
- ✅ image-alt: PASS
- ✅ link-name: PASS
- ✅ label-content-name-mismatch: PASS ✓
- ❌ aria-required-parent: 4 failures (tabs still not direct children of tablist)
- ❌ aria-required-children: 2 failures (tablist has non-tab/status children)
- ⚠️ color-contrast: 8+ items - DEFERRED to custom antd theme implementation

### Remaining Issue: aria-required-parent & aria-required-children

**Root Cause**: The actual Ant Design tab elements (`div role="tab"`) are nested too deeply inside the tablist wrapper due to how renderTabBar wraps each tab in SortableTab.

**Structure Problem**:

```
SortableTabs role="tablist"
  └─ Ant Design Tabs component
    └─ DefaultTabBar (rendered by renderTabBar0)
      └─ SortableTab wrapper (role="tab") ← Added for dnd-kit
        └─ node (Ant Design's internal tab structure)
          └─ div role="tab" (actual Ant Design tab) ← Too deeply nested
```

**Issue**: The innermost `div role="tab"` elements are not direct children of the `role="tablist"` parent. ARIA requires tab elements to be direct children of tablist.

### Possible Solutions

1. **Remove SortableTab wrapper role** - Remove `role="tab"` from SortableTab but this leaves `role="button"` from dnd-kit
2. **Restructure DOM** - Don't wrap each tab node, but wrap the entire nav differently
3. **Accept as-is** - Some frameworks have this limitation with drag-drop + tabs combination
4. **Use different drag approach** - Move drag handle outside the tab element hierarchy

### Remaining Work

**Immediate**:

1. Decide on approach to fix aria-required-parent/children (requires deeper restructuring)

**Future**:

2. **DEFER**: color-contrast (8+ items) - plan custom antd theme with accessibility option

3. **DEFER**: Browser zoom scaling issue - When users enable zoom (`user-scalable=yes`), the page scales but doesn't properly overflow/scroll. Changed PAGE_STYLE width from `100vw` to `100%`, but issue persists. Need to investigate:
   - Whether content is actually overflowing or being reflowed
   - If parent containers (html/body) need explicit overflow handling
   - Possible interactions with fixed positioning elements (nav bar, sidebars)
   - Test on mobile vs desktop browsers
   - May require restructuring how viewport constraints are applied
