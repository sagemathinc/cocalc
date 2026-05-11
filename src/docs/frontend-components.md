# Frontend Components Reference

Brief catalog of reusable components exported from `packages/frontend/components/`.

All components listed here are publicly exported from `components/index.tsx` and can be imported as:

```ts
import { ComponentName } from "@cocalc/frontend/components";
```

## Display

| Component | File | Description |
|-----------|------|-------------|
| `A` | A.tsx | External link that opens in new tab with `rel=noopener`, optional tooltip |
| `ActivityDisplay` | activity-display.tsx | Floating overlay that shows a list of in-progress activity messages |
| `ErrorDisplay` | error-display.tsx | Dismissible antd Alert for rendering error strings or objects |
| `SkinnyError` | skinny-error.tsx | Inline red error text with a close button |
| `HTML` | html.tsx | Sanitized HTML renderer with optional math typesetting and project-aware links |
| `Markdown` | markdown.tsx | Renders a markdown string to HTML (wraps `HTML` with `markdown_to_html`) |
| `RawPrompt` | raw-prompt.tsx | Scrollable monospace box for displaying raw LLM prompt text |
| `Icon` | icon.tsx | Renders antd or FontAwesome icons by name; maps a large icon vocabulary |
| `AIAvatar` | ai-avatar.tsx | SVG avatar icon representing an AI assistant |
| `ProfileIcon` | profile-icon.tsx | Circular user profile image at a given size |
| `Loading` | loading.tsx | Spinner with optional text and fake progress bar, supports delayed display |
| `Saving` | saving.tsx | Small inline "Saving..." indicator with a spinning icon |
| `ProjectState` | project-state.tsx | Displays a project's running/stopped/archived state with icon and label |
| `TimeAgo` | time-ago.tsx | Relative timestamp ("3 minutes ago") with popover showing absolute time |
| `TimeElapsed` | time-elapsed.tsx | Live-updating elapsed-time display (e.g. "2h 15m 3s") |
| `LLMNameLink` | llm-plain-link.tsx | Linked LLM model name pointing to the vendor's URL |
| `UncommittedChanges` | uncommited-changes.tsx | Red warning badge shown when a file has unsaved changes for too long |
| `TableOfContents` | table-of-contents.tsx | Clickable, indented table of contents built from heading entries |

## Input

| Component | File | Description |
|-----------|------|-------------|
| `SearchInput` | search-input.tsx | Search box with clear button, Enter to submit, Escape to clear |
| `TextInput` | text-input.tsx | Controlled text or textarea input with save/cancel buttons |
| `NumberInput` | number-input.tsx | Integer input with min/max validation, saves on blur or Enter |
| `SelectorInput` | selector-input.tsx | Dropdown select from a list or object of options |
| `DateTimePicker` | date-time-picker.tsx | Simplified wrapper around antd DatePicker for picking a date and time |
| `MarkdownInput` | markdown-input/main.tsx | Toggle-able markdown editor: edit raw text or view rendered preview, with save/cancel |

## Buttons and Menus

| Component | File | Description |
|-----------|------|-------------|
| `DropdownMenu` | dropdown-menu.tsx | Antd-based dropdown menu button with mobile-friendly flattened submenus |
| `MenuItem` | dropdown-menu.tsx | Single item in a `DropdownMenu` |
| `MenuDivider` | dropdown-menu.tsx | Divider line between menu items |
| `MarkAll` | mark-all.tsx | "Mark all as read/unread" button with appropriate icon |
| `CloseX` | close-x.tsx | Float-right close button (x icon) for panels |
| `CloseX2` | close-x2.tsx | Close button variant that renders nothing when no `close` callback is provided |
| `SimpleX` | simple-x.tsx | Minimal inline close (x) link |

## Layout

| Component | File | Description |
|-----------|------|-------------|
| `Gap` | gap.tsx | Renders a single `&nbsp;` space |
| `NoWrap` | nowrap.tsx | Wraps children in a `white-space: nowrap` span or div |
| `LabeledRow` | labeled-row.tsx | Two-column row with a label on the left and content on the right |
| `SettingBox` | setting-box.tsx | Card container for a group of settings, with optional icon, title, and close |
| `Tip` | tip.tsx | Tooltip/popover wrapper; uses Tooltip on desktop, Popover on mobile |
| `HelpIcon` | help-icon.tsx | Clickable "?" icon that shows a help popover on click |
| `QuestionMarkText` | question-mark-text.tsx | Text followed by a "?" icon, wrapped in a tooltip |
| `CopyToClipBoard` | copy-to-clipboard.tsx | Read-only input with a one-click copy-to-clipboard button |

## Responsive Visibility

| Component | File | Description |
|-----------|------|-------------|
| `HiddenXS` | hidden-visible.tsx | Hide children on extra-small screens (< 768px) |
| `HiddenSM` | hidden-visible.tsx | Hide children on small screens (< 992px) |
| `HiddenXSSM` | hidden-visible.tsx | Hide children on extra-small and small screens |
| `VisibleMDLG` | hidden-visible.tsx | Show children only on medium and large screens (> 992px) |
| `VisibleLG` | hidden-visible.tsx | Show children only on large screens (> 1200px) |
| `VisibleXSSM` | hidden-visible.tsx | Show children only on extra-small and small screens |
| `VisibleXS` | hidden-visible.tsx | Show children only on extra-small screens |

## Utilities

| Component | File | Description |
|-----------|------|-------------|
| `Delay` | delay.tsx | Renders children only after a specified delay in milliseconds |
| `LoginLink` | login-link.tsx | Alert banner prompting the user to sign in or create an account |
| `PathLink` | path-link.tsx | Clickable file path link that opens the file in a project |
| `UpgradeAdjustor` | upgrade-adjustor.tsx | Form for adjusting project upgrade quotas (RAM, CPU, disk, etc.) |
| `r_human_list` | r\_human\_list.tsx | Joins React nodes with commas and "and" (e.g. "A, B and C") |
| `r_join` | r\_join.tsx | Joins an array of React nodes with a configurable separator |

## Re-exported from antd

| Export | Source | Description |
|--------|--------|-------------|
| `Text` | antd Typography | Inline text with antd typography styles |
| `Title` | antd Typography | Heading element with antd typography styles |
| `Paragraph` | antd Typography | Paragraph element with antd typography styles |

## Constants

| Export | File | Description |
|--------|------|-------------|
| `UNIT` | constants.ts | Base spacing unit (15px) for margins, padding, and sizing |
| `smc_version` | constants.ts | Current CoCalc version string (injected by webpack) |
| `build_date` | constants.ts | Build date string (injected by webpack) |
| `smc_git_rev` | constants.ts | Git revision hash of the build (injected by webpack) |

## Types

| Export | File | Description |
|--------|------|-------------|
| `MenuItems` | dropdown-menu.tsx | Type alias for antd menu items array |
| `IconName` | icon.tsx | String union type of all supported icon names |
| `isIconName` | icon.tsx | Type guard function to check if a string is a valid `IconName` |
| `Estimate` | loading.tsx | TypedMap shape for loading time estimates |
| `is_different_date` | time-ago.tsx | Utility to check if two date values might differ |
| `TableOfContentsEntry` | table-of-contents.tsx | Interface for a single TOC heading entry |
| `TableOfContentsEntryMap` | table-of-contents.tsx | Immutable TypedMap version of `TableOfContentsEntry` |
| `TableOfContentsEntryList` | table-of-contents.tsx | Immutable List of `TableOfContentsEntryMap` |
| `UPGRADE_ERROR_STYLE` | upgrade-adjustor.tsx | CSS style object for upgrade error messages |

## antd-bootstrap

Bootstrap-compatible wrappers built on top of antd components. These re-implement
the react-bootstrap API surface that CoCalc historically relied on, mapping
Bootstrap concepts (bsStyle, bsSize, 12-column grid) to their antd equivalents.

Import as:

```ts
import { ComponentName } from "@cocalc/frontend/antd-bootstrap";
```

### Components

| Component | Description |
|-----------|-------------|
| `Button` | Antd Button with Bootstrap-style props: `bsStyle` (primary, success, info, warning, danger, link, ghost), `bsSize` (large, small, xsmall), and `active` (pressed/toggle look with inset shadow). Wraps in a Tooltip when `title` is provided. Also accepts `block`, `href`, `target`, `autoFocus`, `tabIndex`. |
| `ButtonGroup` | Groups buttons together without gaps using antd `Space.Compact`. Drop-in replacement for react-bootstrap ButtonGroup. |
| `ButtonToolbar` | Horizontally lays out button groups separated by `Gap` spacers via `r_join`. Drop-in replacement for react-bootstrap ButtonToolbar. |
| `Grid` | Simple `div` container with 8px horizontal padding, mimicking the Bootstrap grid wrapper. Accepts `onClick`. |
| `Row` | Antd `Row` with a default `gutter` of 16. Accepts all antd Row props. |
| `Col` | Antd `Col` that translates Bootstrap's 12-column props (`xs`, `sm`, `md`, `lg` and their `*Offset` variants) to antd's 24-column system by doubling values. Also supports `push` and `pull`. |
| `Panel` | Antd `Card` styled as a Bootstrap panel with a header, body, default bottom margin (20px), and configurable `styles.header` / `styles.body`. Supports `size="small"` and `onClick`. |
| `Well` | Antd `Card` styled as a Bootstrap well (white background, light border). Supports `onDoubleClick` and `onMouseDown`. |
| `Alert` | Antd `Alert` that maps Bootstrap `bsStyle` to antd alert types: success, info, warning map directly; danger becomes error; primary becomes success; link becomes info. Supports `banner` mode and custom `icon`. |
| `Modal` | Antd `Modal` mapped from `show`/`onHide` props (no footer, not closable). Includes a `Modal.Body` sub-component that renders children as a fragment. |
| `Tabs` | Antd `Tabs` with Bootstrap-compatible props: `activeKey`, `onSelect`, `animation`, `tabBarExtraContent`, `tabPosition`, `size`. Requires `items` array (AntdTabItem[]). |
| `Tab` | Helper function that returns an `AntdTabItem` object (not a rendered component). Accepts `eventKey`, `title`, `children`, and disables the antd fade transition by default. |
| `Checkbox` | Antd `Checkbox` wrapped in a div with 10px vertical margin (matching react-bootstrap). Resets `fontWeight` to 400 to counteract Bootstrap CSS. |
| `Switch` | Antd `Switch` with a clickable label alongside it. Fires `onChange` with `{ target: { checked } }` signature (same as Checkbox) for easy drop-in use. Supports `disabled`, `labelStyle`. |

### Types

| Export | Description |
|--------|-------------|
| `ButtonStyle` | String union: `"primary"` \| `"success"` \| `"default"` \| `"info"` \| `"warning"` \| `"danger"` \| `"link"` \| `"ghost"` |
| `ButtonSize` | String union: `"large"` \| `"small"` \| `"xsmall"` |
| `AntdTabItem` | Type alias for a single item in the antd Tabs `items` array |
