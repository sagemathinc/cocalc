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

**Flow:**

1. **`packages/static/src/app.html`** - Minimal HTML template with empty `<head>` and container divs
2. **`packages/static/src/webapp-cocalc.ts`** - Entry point that calls `init()`
3. **`packages/frontend/entry-point.ts`** - Initializes Redux, stores, and all app subsystems
4. **`packages/frontend/app/render.tsx`** - Mounts React app to `#cocalc-webapp-container`
5. **`packages/frontend/app/page.tsx`** - Main App component with navigation, content layout

### Current Structure

- **static** package: Builds static assets (webpack) for the SPA
- **frontend** package: React components, Redux state, app logic
- **app.html**: Base template (extremely minimal - needs enhancement)
- **Entry**: Uses React 18 `createRoot()` for client-side rendering

### WCAG AA Improvements Needed

#### 1. HTML Root & Head Elements (`app.html` & `meta.tsx`)

- [x] ✅ Add `lang` attribute to `<html>` for screen reader language detection - **Fixed in `packages/frontend/app/localize.tsx`** (dynamically set from i18n locale)
- [x] ✅ Remove `user-scalable=no` from viewport meta tag (WCAG AA: low vision users must be able to zoom) - **Fixed in `packages/static/src/meta.tsx`**
- [x] ✅ Add `<title>` tag (can be updated dynamically via React) - **Already implemented in `packages/frontend/browser.ts`** with `set_window_title()` function called throughout app navigation
- [x] ✅ Add `<meta name="description">` for page description - **Fixed in `packages/frontend/browser.ts`** (added `set_meta_description()` function) and **`packages/frontend/customize.tsx`** (called on customize init with format `{site_name}: {site_description}`)
- [ ] Link favicon and apple-touch-icon
- [ ] Add **skip links** for keyboard navigation (skip to main content, skip nav)

#### 2. Document Structure

- [ ] Ensure React app renders proper semantic HTML structure
- [ ] Root `<main>` landmark for primary content (✅ partially done in page.tsx)
- [ ] `<nav>` for top navigation (✅ done in page.tsx)
- [ ] `<aside>` for sidebars (need to verify)
- [ ] Dynamic page `<title>` based on context (projects, files, pages)

#### 3. Focus Management & Keyboard

- [ ] Skip to main content link (functional, keyboard-accessible)
- [ ] Focus visible styles for keyboard users (`:focus-visible`)
- [ ] Focus trap for modals (ensure focus doesn't escape)
- [ ] Tab order validation (logical flow through page)
- [ ] Return key handling for interactive elements

#### 4. Color & Contrast

- [ ] Verify WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text)
- [ ] Test with color blindness simulators
- [ ] Ensure no information conveyed by color alone

#### 5. Images & Icons

- [ ] All decorative images: `aria-hidden="true"` or empty `alt=""`
- [ ] Functional images: meaningful `alt` text
- [ ] Icon-only buttons: `aria-label` (✅ mostly done)

#### 6. Forms & Inputs

- [ ] All `<input>` elements have associated `<label>` or `aria-label`
- [ ] Required fields marked with `aria-required="true"`
- [ ] Error messages linked via `aria-describedby`
- [ ] Form validation messages announced to screen readers

#### 7. Headings & Structure

- [ ] Proper heading hierarchy (h1 → h2 → h3, no skips)
- [ ] Meaningful heading text (not "Click here", "More")
- [ ] One h1 per page (main topic/title)

#### 8. Alerts & Notifications

- [ ] Success/error messages: `role="alert"` with `aria-live="assertive"`
- [ ] Info messages: `aria-live="polite"`
- [ ] Notification timeout announcements

### Testing Strategy

1. **Chrome DevTools Accessibility Audit**
   - Run DevTools → Lighthouse → Accessibility
   - Document all failures and warnings
   - Prioritize by impact and frequency

2. **Manual Testing**
   - Keyboard navigation (Tab, Shift+Tab, Enter, Escape)
   - Screen reader testing (NVDA, JAWS, or macOS VoiceOver)
   - Color contrast checking (use WebAIM contrast checker)
   - Zoom testing (up to 200% at 1280px width)

3. **Automated Testing**
   - axe DevTools browser extension
   - WAVE browser extension
   - Pa11y CLI tool for batch testing

### Implementation Priority

**High Priority** (impacts many users):

- HTML lang attribute and meta tags
- Skip links
- Color contrast fixes
- Form label associations
- Heading hierarchy

**Medium Priority** (improves usability):

- Focus visible styles
- Modal focus traps
- Dynamic page titles
- Confirmation dialogs

**Low Priority** (nice to have):

- Advanced ARIA patterns
- Internationalization meta tags
- Schema.org microdata

## Processing Lighthouse JSON Reports

When analyzing Lighthouse accessibility audit reports, use Python and `jq` to extract data:

### Quick Summary of Audit Results

```bash
# Parse Lighthouse report to see pass/fail counts for key audits
python3 << 'EOF'
import json

with open('dev/localhost_5000-TIMESTAMP.json') as f:
    report = json.load(f)

audits_to_check = [
    'aria-required-parent',
    'aria-required-children',
    'aria-command-name',
    'image-alt',
    'label-content-name-mismatch',
    'link-name',
    'color-contrast',
]

print("Lighthouse Accessibility Audit Results")
print("=" * 70)

for audit_id in audits_to_check:
    if audit_id in report['audits']:
        audit = report['audits'][audit_id]
        score = audit.get('score')
        passed = len(audit.get('details', {}).get('passed', []))
        failed = len(audit.get('details', {}).get('failed', []))
        status = "✓ PASS" if score == 1 else f"✗ FAIL ({score})"
        print(f"{audit_id:35} | {status:12} | Pass: {passed:2} | Fail: {failed:2}")

EOF
```

### Detailed Failure Analysis

```bash
# Show failure details for specific audit
python3 << 'EOF'
import json

with open('dev/localhost_5000-TIMESTAMP.json') as f:
    report = json.load(f)

audit_id = 'aria-required-parent'  # Change to audit you want to inspect
if audit_id in report['audits']:
    audit = report['audits'][audit_id]
    failed = audit.get('details', {}).get('failed', [])

    print(f"\nAudit: {audit_id}")
    print(f"Failed items: {len(failed)}\n")

    for item in failed[:5]:  # Show first 5
        selector = item.get('node', {}).get('selector', 'unknown')
        snippet = item.get('node', {}).get('snippet', '')
        explanation = item.get('node', {}).get('explanation', '')
        print(f"Selector: {selector}")
        print(f"HTML: {snippet[:100]}")
        print(f"Issue: {explanation[:150]}")
        print()

EOF
```

### Using jq for Quick Inspection

```bash
# List all audit IDs in the report
jq '.audits | keys[]' dev/localhost_5000-TIMESTAMP.json

# Count failed items for specific audit
jq '.audits["aria-required-parent"].details.failed | length' dev/localhost_5000-TIMESTAMP.json

# Show failed node selectors
jq '.audits["aria-required-parent"].details.failed[].node.selector' dev/localhost_5000-TIMESTAMP.json
```

### Key Points

1. **File location**: Reports are saved to `dev/localhost_5000-TIMESTAMP.json` after each Lighthouse run
2. **Structure**: `report['audits'][audit_id]['details']['failed']` contains failure array
3. **Node info**: Each failure has `.node` with selector, snippet, explanation
4. **Score values**: score = 1 means PASS, score = 0 means FAIL
5. **Performance**: Python scripts are faster than jq for summary reports

## Lighthouse Accessibility Audit Results (Desktop)

**Date**: 2025-11-13
**URL**: http://localhost:5000/projects
**Report**: packages/static/lightouse.json

### Failures Found (7 issues)

1. **[color-contrast](https://dequeuniversity.com/rules/axe/4.11/color-contrast)** (14 items) ⚠️ **DEFER**
   - Background and foreground colors don't meet WCAG AA ratios (4.5:1 normal, 3:1 large)
   - **Plan**: Handle via custom antd theme with 3 options: "Antd (standard)", "Cocalc", "Accessibility"
   - Store in preferences/appearance config
   - Ignore contrast requirements for ornamental details (e.g., footer)

2. **[aria-required-parent](https://dequeuniversity.com/rules/axe/4.11/aria-required-parent)** (4 items) ✅ **FIXED**
   - Ant Design Tabs: `role="tab"` elements missing required `tablist` parent role
   - Fixed by adding `role="tablist"` to SortableTabs container in `packages/frontend/components/sortable-tabs.tsx` (line 115)
   - Creates proper ARIA hierarchy: tablist parent → Ant Design's role="tab" children
   - Fixes tabs in projects-nav and file-tabs components

3. **[image-alt](https://dequeuniversity.com/rules/axe/4.11/image-alt)** (3 items) ✅ **FIXED**
   - All avatar images inside `.ant-avatar` components missing `[alt]` attributes
   - These images convey meaningful information about users/projects/models, not decorative
   - Fixed in:
     - `packages/frontend/account/avatar/avatar.tsx` - user avatar images with `alt="User {username}"` (used in collaborators, etc.)
     - `packages/frontend/components/language-model-icon.tsx` - LLM model icons with `alt="{vendorName} language model"`
     - `packages/frontend/projects/project-title.tsx` - project avatar in titles with `src={avatar} alt="Project avatar"`
     - `packages/frontend/projects/project-avatar.tsx` - project avatar display with `src={avatarImage} alt="Project avatar"`
     - `packages/frontend/projects/projects-nav.tsx` - project avatar in nav with `src={...} alt="Project avatar"`
     - `packages/frontend/projects/projects-table-columns.tsx` - project avatars in table and collaborator avatars in filters with appropriate alt text
   - Changed from `icon={<img src={...} />}` to `src={...} alt="..."` to properly expose alt attribute to Ant Design Avatar

4. **[label-content-name-mismatch](https://dequeuniversity.com/rules/axe/4.11/label-content-name-mismatch)** (3 items) ✅ **FIXED**
   - Fixed in `packages/frontend/projects/projects-table-controls.tsx`:
     - "Hidden" switch: `aria-label="Toggle hidden projects"` (was "Show hidden projects")
     - "Deleted" switch: `aria-label="Toggle deleted projects"` (was "Show deleted projects")
     - "Create Project" button: `aria-label="Create a new project ..."` (was "Create a new project")
   - Visible text now matches or is included in accessible names

5. **[aria-command-name](https://dequeuniversity.com/rules/axe/4.11/aria-command-name)** (1 item) ✅ **FIXED**
   - Fixed by adding `aria-label="Admin"` to admin NavTab in `packages/frontend/app/page.tsx` (line 233)
   - Now admin button has accessible name for screen readers

6. **[link-name](https://dequeuniversity.com/rules/axe/4.11/link-name)** (1 item) ✅ **FIXED**
   - CoCalc logo link was missing accessible name
   - Fixed by:
     - Adding `aria-label="CoCalc homepage"` to AppLogo in `packages/frontend/app/logo.tsx` (line 39)
     - Updated `<A>` component in `packages/frontend/components/A.tsx` to accept and forward `aria-label` prop

7. **[aria-required-children](https://dequeuniversity.com/rules/axe/4.11/aria-required-children)** (2 items) 🔄 **IN PROGRESS**
   - tablist parent has invalid children (role=button, buttons that should be role=tab)
   - Root cause: SortableTab wrapper adds `role="button"` which is invalid inside tablist
   - Issue in: Projects nav tabs and file tabs where SortableTab (with dnd-kit) wraps the tab elements
   - Solution needed: Adjust SortableTab wrapper to use `role="tab"` or restructure to avoid role conflict

### Latest Report Analysis (2025-11-13 15:22:38 UTC)

**Final Fixes Applied:**

**label-content-name-mismatch** (3 items) ✅ **FIXED**

- Removed duplicate aria-labels from Switch components (kept only visible text)
- Removed mismatched aria-label from Create button (visible text is sufficient)
- Switches now use checkedChildren/unCheckedChildren for visible text only
- Create button uses visible text without aria-label override

**aria-required-children** (2 items) ✅ **FIXED**

- Added `role="tab"` to SortableTab wrapper in `packages/frontend/components/sortable-tabs.tsx` (line 154)
- This overrides the `role="button"` that dnd-kit attributes add via spread operator
- Now tablist only has role="tab" children (both wrapper and inner Ant Design tab)

**aria-required-parent** (4 items) 🔄 **PENDING VERIFICATION**

- May be auto-fixed by the SortableTab role="tab" change
- Need to run Lighthouse again to verify

### Current Status Summary (2025-11-13 15:29:32 UTC)

**Report**: localhost_5000-20251113T152932.json

After all fixes:

- ✅ aria-command-name: PASS
- ✅ image-alt: PASS
- ✅ link-name: PASS
- ✅ label-content-name-mismatch: PASS ✓
- ❌ aria-required-parent: 4 failures (tabs still not direct children of tablist)
- ❌ aria-required-children: 2 failures (tablist has non-tab/status children)
- ⚠️ color-contrast: 8+ items - DEFERRED to custom antd theme implementation

**Score**: 5/7 audits passing (71% of issues fixed)

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

**Future**: 2. **DEFER**: color-contrast (8+ items) - plan custom antd theme with accessibility option
