# ARIA Landmarks and Accessibility in CoCalc Frontend

This document explains how to implement ARIA landmarks in the CoCalc frontend to enable proper landmark-based navigation for assistive technology users (screen readers, keyboard navigation tools, etc.).

## What are ARIA Landmarks?

ARIA landmarks are a set of **eight roles** that identify the major sections of a web page. They enable:

1. **Better Navigation** - Screen reader and keyboard users can jump between major page sections
2. **Semantic Structure** - Clear communication of page organization beyond visual layout
3. **Accessibility Compliance** - Support for keyboard-based landmark navigation ("landmark mode")

The eight landmark roles are:

- **`main`** - Primary content area
- **`navigation`** - Navigation links and sections
- **`search`** - Search functionality
- **`banner`** - Site header/branding area
- **`contentinfo`** - Footer information
- **`complementary`** - Supplementary content (sidebars, related info)
- **`form`** - Form containers
- **`region`** - Generic labeled sections (requires `aria-label` or `aria-labelledby`)

## CoCalc Frontend Structure

The CoCalc frontend has a **three-level hierarchy** of navigation and content areas:

### Level 1: Application Shell (`app/page.tsx`)

The root of the entire application with top-level navigation:

- **Main navigation bar** - Switches between projects, settings, admin, account
- **Projects navigation** - Horizontal tabs showing open projects
- **Main content area** - The currently active project or page

### Level 2: Project Workspace (`project/page/page.tsx`)

Inside each project, a secondary level of structure:

- **File tab bar** - Navigation between open files within the project (2nd level of navigation)
- **Activity bar** - Vertical sidebar with project tools and features
- **Editor area** - Main content area for the active file/editor
- **Flyout panel** - Optional right sidebar for chat, collaborators, etc.

### Level 3: Editor Features (within `Content` components)

Inside each editor:

- **Toolbars and menus** - Editor-specific controls
- **Symbol bars** - Language-specific panels
- **Editor content** - The actual file being edited

## Implementing Landmarks in CoCalc

### Best Practices

1. **Maximum 7 landmarks per page** - Too many landmarks reduce their utility
2. **Every major content section should be within a landmark** - Avoid content outside landmarks
3. **Use semantic HTML when possible** - `<main>`, `<nav>`, `<aside>`, `<footer>` automatically create landmarks
4. **Use `aria-label` for distinguishing between similar landmark types** - When you have multiple `<aside>` or `region` elements, labels help users identify which is which
5. **Meaningful labels** - "Editor content" is better than "main" for a `region`

### Landmark Placement Strategy for CoCalc

```
<main>  // Application root - primary content area

  <nav aria-label="Application navigation">
    // Logo, top-level tabs (projects, settings, admin), account menu
  </nav>

  <div>  // Projects navigation bar
    // Individual project tabs
  </div>

  <div>  // Active project workspace

    <nav aria-label="Open files">
      // ProjectTabs - file tab bar (2nd level)
    </nav>

    <div style={{ display: "flex" }}>

      <aside role="complementary" aria-label="Project activity bar">
        // Activity bar buttons and icons
      </aside>

      <main role="main" aria-label="Editor content">
        // Current editor, file content, or project page

        <nav aria-label="Editor toolbar">
          // Editor-specific controls and commands
        </nav>

        <div role="region" aria-label="Editor symbols">
          // Language-specific symbol bar or outline panel
        </div>

        <div role="region" aria-label="File content">
          // The actual editor content area
        </div>
      </main>

      <aside role="complementary" aria-label="Project sidebar">
        // Flyout panel - chat, collaborators, etc.
      </aside>

    </div>
  </div>
</main>
```

## Using ARIA Landmarks in React/TSX

### Basic Semantic HTML Approach

The simplest approach uses semantic HTML elements which automatically create landmarks:

```tsx
import React from "react";

export const Page: React.FC = () => {
  return (
    <main>
      <nav>{/* Top-level navigation */}</nav>

      <aside>{/* Complementary content */}</aside>

      <footer>{/* Footer information */}</footer>
    </main>
  );
};
```

### Using aria-label for Clarity

When you have multiple sections of the same type, use `aria-label` to distinguish them. **Make labels dynamic and context-aware** to provide more useful information:

```tsx
export const ProjectWorkspace: React.FC<{
  projectName: string;
  activeFile?: { path: string; type: string };
}> = ({ projectName, activeFile }) => {
  return (
    <main>
      {/* First level: app navigation */}
      <nav aria-label="Application navigation">
        <Logo />
        <ProjectsNav />
      </nav>

      {/* Second level: file navigation - include project name for context */}
      <nav aria-label={`Open files in project: ${projectName}`}>
        <ProjectTabs />
      </nav>

      {/* Main workspace layout */}
      <div style={{ display: "flex", flex: 1 }}>
        {/* Left sidebar */}
        <aside
          role="complementary"
          aria-label={`Project activity bar for ${projectName}`}
        >
          <ActivityBar />
        </aside>

        {/* Center content - dynamic label with file info */}
        <main
          role="main"
          aria-label={
            activeFile
              ? `${activeFile.type} editor: ${activeFile.path}`
              : "Project content"
          }
        >
          <Editor />
        </main>

        {/* Right sidebar */}
        <aside role="complementary" aria-label={`Sidebar for ${projectName}`}>
          <Flyout />
        </aside>
      </div>
    </main>
  );
};
```

### Using role="region" for Custom Sections

For more specific sub-sections within editors or complex components, use `role="region"` with **dynamic, descriptive `aria-label`** that includes file context:

```tsx
interface EditorProps {
  filePath: string;
  fileType: string; // e.g., "Python", "Jupyter Notebook", "Markdown"
  fileName: string; // e.g., "analysis.py", "notebook.ipynb"
}

export const Editor: React.FC<EditorProps> = ({
  filePath,
  fileType,
  fileName,
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      {/* Toolbar section - include file type and name */}
      <div
        role="region"
        aria-label={`${fileType} editor toolbar for ${fileName}`}
      >
        <EditorToolbar />
      </div>

      {/* Symbol/outline panel - specific to file */}
      <div role="region" aria-label={`Symbols and outline for ${fileName}`}>
        <SymbolPanel />
      </div>

      {/* Main editor content - full context */}
      <div
        role="region"
        aria-label={`${fileType} editor: ${filePath}`}
        className="editor-content"
      >
        <CodeEditor />
      </div>
    </div>
  );
};
```

**Example dynamic labels for different file types:**

- **Jupyter Notebook** → `"Jupyter Notebook editor: /path/to/analysis.ipynb"`
- **Python file** → `"Python editor: /path/to/script.py"`
- **Markdown file** → `"Markdown editor: /path/to/README.md"`
- **R file** → `"R editor: /path/to/analysis.R"`
- **Octave/MATLAB** → `"Octave editor: /path/to/compute.m"`

### With Conditional Rendering

```tsx
export const ProjectPage: React.FC = (props) => {
  const { showFlyout, flyoutContent } = props;

  return (
    <main>
      <nav aria-label="Open files">
        <FileTabs />
      </nav>

      <div style={{ display: "flex", flex: 1 }}>
        <aside role="complementary" aria-label="Activity bar">
          <ActivityBar />
        </aside>

        <main role="main" aria-label="Editor">
          <Content />
        </main>

        {showFlyout && (
          <aside role="complementary" aria-label="Project sidebar">
            {flyoutContent}
          </aside>
        )}
      </div>
    </main>
  );
};
```

### Using aria-labelledby for Heading Association

You can also reference a heading instead of providing a label:

```tsx
export const Editor: React.FC = () => {
  return (
    <div>
      <h2 id="editor-toolbar-heading">Formatting</h2>
      <div role="region" aria-labelledby="editor-toolbar-heading">
        {/* Toolbar content */}
      </div>
    </div>
  );
};
```

## Nested Frame Trees and Split Editors

CoCalc editors can contain **nested frame trees** (defined in `packages/frontend/frame-editors/frame-tree/frame-tree.tsx`), where a single editor window can be split into multiple frames organized in a binary tree structure:

- A frame can be either a **node** (a split with two child frames) or a **leaf** (an actual editor)
- Nodes have a **direction**: `"col"` (vertical split) or `"row"` (horizontal split)
- Each frame has a unique `id` and may represent different file types (code editors, output, terminals, etc.)

### Annotating Split Frames with ARIA

When a user splits an editor into multiple frames, use `role="region"` with meaningful labels that describe:

1. **The position in the tree** (left/right or top/bottom)
2. **The file type(s)** in each frame
3. **The direction of the split**

**Example: Split Jupyter Notebook (top output, bottom code)**

```tsx
interface FrameNodeProps {
  direction: "row" | "col"; // row = horizontal split, col = vertical split
  filePath: string;
  fileType: string;
  firstChildLabel: string;
  secondChildLabel: string;
}

export const FrameNode: React.FC<FrameNodeProps> = ({
  direction,
  filePath,
  fileType,
  firstChildLabel,
  secondChildLabel,
}) => {
  const splitType = direction === "col" ? "vertical split" : "horizontal split";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: direction === "row" ? "row" : "column",
        flex: 1,
      }}
      role="region"
      aria-label={`${fileType} editor with ${splitType}: ${filePath}`}
    >
      {/* First frame (top or left) */}
      <div
        style={{ flex: 0.5 }}
        role="region"
        aria-label={`${firstChildLabel} in ${fileType}: ${filePath}`}
      >
        {/* First editor/output frame */}
      </div>

      {/* Drag bar between frames */}
      <div className="frame-dragbar" />

      {/* Second frame (bottom or right) */}
      <div
        style={{ flex: 0.5 }}
        role="region"
        aria-label={`${secondChildLabel} in ${fileType}: ${filePath}`}
      >
        {/* Second editor/output frame */}
      </div>
    </div>
  );
};
```

### Practical Examples

**Jupyter Notebook split vertically (code on left, output on right):**

```tsx
aria-label={`Jupyter Notebook editor with vertical split: analysis.ipynb`}
  ├─ aria-label={`Code input in Jupyter: analysis.ipynb`}
  └─ aria-label={`Output/preview in Jupyter: analysis.ipynb`}
```

**Python file split horizontally (code on top, terminal on bottom):**

```tsx
aria-label={`Python editor with horizontal split: script.py`}
  ├─ aria-label={`Code editor in Python: script.py`}
  └─ aria-label={`Terminal in Python workspace: script.py`}
```

**LaTeX document with multiple frames (source, preview, build output):**

```tsx
aria-label={`LaTeX editor with horizontal split: document.tex`}
  ├─ aria-label={`LaTeX source in document.tex`}
  └─ aria-label={`LaTeX preview/build output in document.tex`}
```

### Implementation Pattern for FrameTree

In `packages/frontend/frame-editors/frame-tree/frame-tree.tsx`, when rendering split frames:

```tsx
function render_cols() {
  const data = get_data("row");
  return (
    <div
      ref={cols_container_ref}
      style={data.outer_style}
      role="region"
      aria-label={`Editor frames split vertically: ${path}`}
    >
      <div className={"smc-vfill"} style={data.style_first}>
        {render_one(data.first)}
      </div>
      <FrameTreeDragBar
        actions={actions}
        containerRef={cols_container_ref}
        dir={"col"}
        frame_tree={frame_tree}
      />
      <div
        className={"smc-vfill"}
        style={data.style_second}
        role="region"
        aria-label={`Second frame in split editor: ${path}`}
      >
        {render_one(data.second)}
      </div>
    </div>
  );
}

function render_rows() {
  const data = get_data("column");
  return (
    <div
      className={"smc-vfill"}
      ref={rows_container_ref}
      style={data.outer_style}
      role="region"
      aria-label={`Editor frames split horizontally: ${path}`}
    >
      <div className={"smc-vfill"} style={data.style_first}>
        {render_one(data.first)}
      </div>
      <FrameTreeDragBar
        actions={actions}
        containerRef={rows_container_ref}
        dir={"row"}
        frame_tree={frame_tree}
      />
      <div
        className={"smc-vfill"}
        style={data.style_second}
        role="region"
        aria-label={`Second frame in split editor: ${path}`}
      >
        {render_one(data.second)}
      </div>
    </div>
  );
}
```

### Key Points for Frame Tree Annotations

1. **Use hierarchy** - Outer region describes the split, inner regions describe content
2. **Include split direction** - "vertical split" vs "horizontal split"
3. **Include file path** - Screen reader users should know which file is being edited
4. **Include frame type** - If frames contain different types (code vs output vs terminal)
5. **Describe position** - "First frame" and "Second frame" help users understand layout
6. **Dynamic labels** - Update labels when:
   - The file is changed
   - Frames are reorganized
   - New splits are created or removed

## Editor Title Bar and Toolbar Annotations

Each editor frame has a **title bar** (defined in `packages/frontend/frame-editors/frame-tree/title-bar.tsx`) containing menus, buttons, and controls. This should be annotated with ARIA regions to help users navigate the editor interface.

### Title Bar Structure

The title bar contains several distinct sections:

1. **Menus** - Dropdown menus (File, Edit, View, Insert, etc.)
2. **Action Buttons** - Save, time travel, compute server, AI assistant
3. **Symbol Bar** - Language-specific symbols (optional second row)
4. **Frame Controls** - Split, fullscreen, close frame buttons
5. **Connection Status** - Network/sync status indicator

### Annotating the Title Bar

The entire title bar should be a region describing its purpose and file context:

```tsx
<div
  role="region"
  aria-label={`${fileType} editor toolbar for ${fileName}`}
  id={`titlebar-${props.id}`}
  className={"cc-frame-tree-title-bar"}
>
  {/* Sub-regions below */}
</div>
```

### Sub-Sections within the Title Bar

Break down the title bar into logical regions:

```tsx
interface TitleBarProps {
  filePath: string;
  fileName: string;
  fileType: string; // "Python", "Jupyter Notebook", etc.
  id: string;
}

export const EditorTitleBar: React.FC<TitleBarProps> = ({
  filePath,
  fileName,
  fileType,
  id,
}) => {
  return (
    <div
      role="region"
      aria-label={`${fileType} editor toolbar for ${fileName}`}
      id={`titlebar-${id}`}
      className={"cc-frame-tree-title-bar"}
    >
      {/* Menus section */}
      <nav aria-label={`Editor menus for ${fileName}`}>
        {/* File, Edit, View, Insert, Format, etc. menus */}
      </nav>

      {/* Main action buttons */}
      <div role="region" aria-label={`Editor controls for ${fileName}`}>
        {/* Save, time travel, AI, compute server buttons */}
      </div>

      {/* Symbol bar - language-specific symbols/outline */}
      <div
        role="region"
        aria-label={`Symbols and outline for ${fileName}`}
        className="symbol-bar"
      >
        {/* Language-specific symbols, outline, or tabs */}
      </div>

      {/* Frame management controls */}
      <div role="region" aria-label={`Frame controls for ${fileName}`}>
        {/* Split horizontally, split vertically, fullscreen, close */}
      </div>

      {/* Connection status */}
      <div aria-live="polite" aria-label={`Connection status for ${fileName}`}>
        {/* Connected/disconnected/connecting indicator */}
      </div>
    </div>
  );
};
```

### Detailed Sub-Region Annotations

#### 1. Editor Menus

```tsx
<nav aria-label={`Menus for ${fileType} editor: ${fileName}`} role="navigation">
  {/* File Menu */}
  <button aria-haspopup="menu" aria-label="File menu">
    File
  </button>

  {/* Edit Menu */}
  <button aria-haspopup="menu" aria-label="Edit menu">
    Edit
  </button>

  {/* View Menu */}
  <button aria-haspopup="menu" aria-label="View menu">
    View
  </button>

  {/* Additional menus based on editor type */}
  {/* e.g., Insert, Format, Build for LaTeX */}
</nav>
```

#### 2. Action Buttons Section

```tsx
<div role="region" aria-label={`Actions for ${fileName}`}>
  {/* Save button with status */}
  <button aria-label={`Save ${fileName} - last saved ${lastSaveTime}`}>
    <Icon name="save" />
  </button>

  {/* Time travel / history */}
  <button aria-label={`View history of ${fileName}`}>
    <Icon name="history" />
  </button>

  {/* AI Assistant */}
  <button aria-label={`AI assistant for ${fileName}`}>
    <Icon name="sparkles" />
  </button>

  {/* Compute server selector */}
  <select aria-label={`Compute server for ${fileName}`}>
    {/* Server options */}
  </select>

  {/* More actions menu */}
  <button aria-haspopup="menu" aria-label={`More actions for ${fileName}`}>
    ⋮
  </button>
</div>
```

#### 3. Symbol Bar (Language-Specific)

```tsx
<div
  role="region"
  aria-label={`Symbols and outline for ${fileName}`}
  className="symbol-bar"
>
  {/* Python: Classes, functions, variables */}
  {/* Java: Packages, classes, methods */}
  {/* LaTeX: Sections, subsections, figures */}
  {/* Markdown: Headers, sections */}
</div>
```

#### 4. Frame Controls

```tsx
<div role="region" aria-label={`Layout controls for ${fileName}`}>
  {/* Split horizontally (top/bottom) */}
  <button aria-label={`Split ${fileName} horizontally`}>
    <Icon name="layout-horiz" />
  </button>

  {/* Split vertically (left/right) */}
  <button aria-label={`Split ${fileName} vertically`}>
    <Icon name="layout-vert" />
  </button>

  {/* Fullscreen */}
  <button aria-label={`Fullscreen ${fileName}`}>
    <Icon name="fullscreen" />
  </button>

  {/* Close frame */}
  <button aria-label={`Close ${fileName}`}>
    <Icon name="times" />
  </button>
</div>
```

#### 5. Connection Status

Use `aria-live="polite"` for status changes that should be announced:

```tsx
<div
  aria-live="polite"
  aria-label={`Connection status for ${fileName}`}
  role="status"
>
  {connectionStatus === "connected" && (
    <span aria-label="Saved to server">✓</span>
  )}
  {connectionStatus === "connecting" && (
    <span aria-label="Saving to server">↻</span>
  )}
  {connectionStatus === "disconnected" && (
    <span aria-label="Not connected to server">✗</span>
  )}
</div>
```

### Implementation in FrameTitleBar

In `packages/frontend/frame-editors/frame-tree/title-bar.tsx`, the main render function (line 1334) should be updated:

```tsx
return (
  <>
    <div
      role="region"
      aria-label={`${getFileType(path)} editor toolbar for ${getFileName(path)}`}
      id={`titlebar-${props.id}`}
      className={"cc-frame-tree-title-bar"}
    >
      {/* Menus with navigation role */}
      <nav aria-label={`Menus for ${getFileName(path)}`}>
        {renderMainMenusAndButtons()}
      </nav>

      {/* Controls section */}
      <div role="region" aria-label={`Controls for ${getFileName(path)}`}>
        {is_active && renderConnectionStatus()}
        {is_active && allButtonsPopover()}
      </div>

      {/* Symbol bar with descriptive label */}
      {!showSymbolBarLabels ? (
        <div role="region" aria-label={`Symbols for ${getFileName(path)}`}>
          {renderButtonBar()}
        </div>
      ) : undefined}

      {/* Frame controls section */}
      <div role="region" aria-label={`Frame controls for ${getFileName(path)}`}>
        {renderFrameControls()}
      </div>
    </div>

    {/* Optional second row symbol bar */}
    {showSymbolBarLabels ? (
      <div role="region" aria-label={`Symbols for ${getFileName(path)}`}>
        {renderButtonBar()}
      </div>
    ) : undefined}

    {renderConfirmBar()}
    {hasTour && props.is_visible && props.tab_is_visible && (
      <TitleBarTour refs={tourRefs} />
    )}
    {renderComputeServerDocStatus()}
  </>
);
```

### Examples for Different File Types

**Python Editor:**

```
Python editor toolbar for script.py
├─ Menus for script.py
│  ├─ File menu
│  ├─ Edit menu
│  ├─ View menu
│  └─ Run menu
├─ Controls for script.py
│  ├─ Save button
│  ├─ Time travel
│  └─ Compute server selector
├─ Symbols for script.py
│  └─ Classes, functions, variables
└─ Frame controls for script.py
   ├─ Split horizontally
   ├─ Split vertically
   └─ Close
```

**Jupyter Notebook:**

```
Jupyter Notebook editor toolbar for analysis.ipynb
├─ Menus for analysis.ipynb
│  ├─ File menu
│  ├─ Edit menu
│  ├─ View menu
│  ├─ Insert menu
│  └─ Kernel menu
├─ Controls for analysis.ipynb
│  ├─ Save button
│  ├─ Time travel
│  ├─ AI assistant
│  └─ Compute server selector
├─ Symbols for analysis.ipynb
│  └─ Cell outline/navigation
└─ Frame controls for analysis.ipynb
```

**LaTeX Document:**

```
LaTeX editor toolbar for document.tex
├─ Menus for document.tex
│  ├─ File menu
│  ├─ Edit menu
│  ├─ View menu
│  ├─ Insert menu
│  └─ Build menu
├─ Controls for document.tex
│  ├─ Save button
│  ├─ Build button
│  ├─ View PDF
│  └─ Time travel
├─ Symbols for document.tex
│  └─ Sections, subsections, figures
└─ Frame controls for document.tex
```

### Key Principles for Title Bar Annotation

1. **Use `<nav>` for menus** - Menus are navigation, use semantic `<nav>` or `role="navigation"`
2. **Use `role="region"` with `aria-label`** for toolbar sections that aren't navigation
3. **Include file context** - Always mention the filename in button and control labels
4. **Use `aria-live="polite"`** for status updates (connection, save status)
5. **Use `aria-haspopup="menu"`** for buttons that open dropdown menus
6. **Be specific about actions** - "Save script.py" not just "Save"
7. **Group related controls** - Use regions to group save, time travel, and AI buttons together
8. **Dynamic labels** - Update labels if the file is renamed or editor type changes

## Jupyter Notebook Cell Annotations

Jupyter notebooks consist of a vertical list of cells, where each cell is either **code** or **markdown**. Each cell should be annotated as a distinct `role="region"` with a clear label including:

1. **Cell number** - Position in the notebook (Cell 1, Cell 2, etc.)
2. **Cell type** - "Code cell" or "Markdown cell"
3. **Cell content preview** (optional) - Brief indication of what the cell contains

### Cell Structure

Cells are rendered in `packages/frontend/jupyter/cell-list.tsx` via the `renderCell()` function, which receives:

- `id` - Unique identifier for the cell
- `index` - The cell's position number (0-indexed)
- `cell.get("cell_type")` - Either `"code"` or `"markdown"`

### Annotating Individual Cells

Each cell should be wrapped in a `region` with a descriptive label:

```tsx
// In packages/frontend/jupyter/cell-list.tsx, renderCell function:

interface CellProps {
  id: string;
  index: number;
  cell: any; // immutable Map with cell data
  filePath: string; // path to the notebook file
  // ... other props
}

function renderCell({
  id,
  index,
  isScrolling,
  isDragging,
}: {
  id: string;
  index?: number;
  isScrolling?: boolean;
  isDragging?: boolean;
}) {
  const cell = cells.get(id);
  if (cell == null) return null;
  if (index == null) {
    index = cell_list.indexOf(id) ?? 0;
  }

  const cellType = cell.get("cell_type"); // "code" or "markdown"
  const cellNumber = index + 1; // Convert to 1-indexed for user readability
  const notebookFileName = getFileName(path); // Extract filename from path

  const cellLabel =
    cellType === "code"
      ? `Code cell ${cellNumber} in ${notebookFileName}`
      : `Markdown cell ${cellNumber} in ${notebookFileName}`;

  return (
    <div
      key={id}
      role="region"
      aria-label={cellLabel}
      id={`cell-${id}`}
      className="jupyter-cell"
    >
      <Cell
        id={id}
        index={index}
        actions={actions}
        name={name}
        cm_options={cm_options}
        cell={cell}
        is_current={id === cur_id}
        // ... other props
      />
    </div>
  );
}
```

### Cell Container Annotation

The entire cell list should also be annotated as a region:

```tsx
// In packages/frontend/jupyter/cell-list.tsx, in the CellList component render:

if (use_windowed_list) {
  body = (
    <div
      role="region"
      aria-label={`Jupyter notebook cells for ${getFileName(path)}`}
      ref={cellListDivRef}
      className="smc-vfill"
    >
      <Virtuoso
        ref={virtuosoRef}
        // ... virtuoso props
        itemContent={(index) => {
          // renderCell with proper annotations
        }}
      />
    </div>
  );
} else {
  body = (
    <div
      role="region"
      aria-label={`Jupyter notebook cells for ${getFileName(path)}`}
      key="cells"
      className="smc-vfill"
      ref={cellListDivRef}
      // ... other props
    >
      {v}
    </div>
  );
}
```

### Detailed Cell Annotation

For better accessibility, you might annotate different parts of each cell:

```tsx
function renderCell({ id, index }: { id: string; index?: number }) {
  const cell = cells.get(id);
  const cellType = cell.get("cell_type"); // "code" or "markdown"
  const cellNumber = (index ?? 0) + 1;
  const isCurrent = id === cur_id;
  const isSelected = sel_ids?.contains(id);

  const cellLabel =
    cellType === "code"
      ? `Code cell ${cellNumber}`
      : `Markdown cell ${cellNumber}`;

  // Add additional context if currently selected or focused
  let fullLabel = cellLabel;
  if (isCurrent) {
    fullLabel += " (active)";
  }
  if (isSelected) {
    fullLabel += " (selected)";
  }

  return (
    <div
      role="region"
      aria-label={fullLabel}
      aria-current={isCurrent ? "true" : undefined}
      id={`cell-${id}`}
      className={`jupyter-cell ${isSelected ? "selected" : ""}`}
    >
      {/* Cell input area */}
      <div role="region" aria-label={`Input for ${cellLabel}`}>
        {/* Code editor or markdown editor */}
      </div>

      {/* Cell output area (for code cells) */}
      {cellType === "code" && (
        <div role="region" aria-label={`Output for ${cellLabel}`}>
          {/* Execution output, plots, etc. */}
        </div>
      )}

      {/* Cell metadata/toolbar */}
      <div
        role="region"
        aria-label={`Controls for ${cellLabel}`}
        className="cell-toolbar"
      >
        {/* Delete, run, move up/down buttons, etc. */}
      </div>
    </div>
  );
}
```

### Examples for Different Cell Types

**Code Cell #1:**

```
Code cell 1 (active)
├─ Input for Code cell 1
├─ Output for Code cell 1
└─ Controls for Code cell 1
```

**Markdown Cell #2:**

```
Markdown cell 2 (selected)
├─ Input for Markdown cell 2
└─ Controls for Markdown cell 2
```

**Code Cell #3:**

```
Code cell 3
├─ Input for Code cell 3
├─ Output for Code cell 3 (contains plots, tables, etc.)
└─ Controls for Code cell 3
```

### Cell Status and Navigation

Cells can have different states that should be reflected in accessibility information:

```tsx
function getCellAriaLabel(
  cell: any,
  index: number,
  isCurrent: boolean,
  isSelected: boolean,
  hasError: boolean,
): string {
  const cellType = cell.get("cell_type"); // "code" or "markdown"
  const cellNumber = index + 1;
  const typeLabel = cellType === "code" ? "Code cell" : "Markdown cell";

  let label = `${typeLabel} ${cellNumber}`;

  // Add status indicators
  if (cellType === "code") {
    const executionCount = cell.get("execution_count");
    if (executionCount != null) {
      label += ` (executed ${executionCount})`;
    } else {
      label += " (not yet executed)";
    }
  }

  if (isCurrent) {
    label += " (current/active)";
  }

  if (isSelected) {
    label += " (selected)";
  }

  if (hasError) {
    label += " (has error)";
  }

  return label;
}
```

### Implementation in JupyterEditor

In `packages/frontend/jupyter/main.tsx` and `packages/frontend/jupyter/cell-list.tsx`:

```tsx
// In cell-list.tsx

export const CellList: React.FC<CellListProps> = (props: CellListProps) => {
  // ... existing code ...

  function renderCell({
    id,
    isScrolling,
    index,
    delayRendering,
    isFirst,
    isLast,
    isDragging,
  }: {
    id: string;
    isScrolling?: boolean;
    index?: number;
    delayRendering?: number;
    isFirst?: boolean;
    isLast?: boolean;
    isDragging?: boolean;
  }) {
    const cell = cells.get(id);
    if (cell == null) return null;
    if (index == null) {
      index = cell_list.indexOf(id) ?? 0;
    }

    const cellType = cell.get("cell_type");
    const cellNumber = index + 1;
    const isCurrent = id === cur_id;
    const isSelected = sel_ids?.contains(id);
    const hasError =
      cellType === "code" &&
      cell.get("outputs")?.some((o) => o.get("output_type")?.includes("error"));

    const cellLabel = `${
      cellType === "code" ? "Code" : "Markdown"
    } cell ${cellNumber}${isCurrent ? " (current)" : ""}${
      isSelected ? " (selected)" : ""
    }${hasError ? " (has error)" : ""}`;

    const dragHandle = actions?.store.is_cell_editable(id) ? (
      <DragHandle
        id={id}
        style={
          {
            /* ... */
          }
        }
      />
    ) : undefined;

    return (
      <div
        key={id}
        role="region"
        aria-label={cellLabel}
        aria-current={isCurrent ? "true" : undefined}
        id={`cell-${id}`}
        className={`jupyter-cell ${isSelected ? "selected" : ""}`}
      >
        <Cell
          id={id}
          index={index}
          actions={actions}
          name={name}
          cm_options={cm_options}
          cell={cell}
          is_current={isCurrent}
          hook_offset={hook_offset}
          is_selected={isSelected}
          is_markdown_edit={md_edit_ids?.contains(id)}
          mode={mode}
          font_size={font_size}
          project_id={project_id}
          directory={directory}
          complete={complete}
          is_focused={is_focused}
          is_visible={is_visible}
          more_output={more_output?.get(id)}
          cell_toolbar={cell_toolbar}
          trust={trust}
          is_scrolling={isScrolling}
          delayRendering={delayRendering}
          llmTools={llmTools}
          computeServerId={computeServerId}
          isFirst={isFirst}
          isLast={isLast}
          dragHandle={dragHandle}
          read_only={read_only}
          isDragging={isDragging}
        />
      </div>
    );
  }

  // ... rest of function ...
};
```

### Key Principles for Cell Annotation

1. **Cell number should be visible** - Users need to know which cell they're on (Cell 1, Cell 2, etc.)
2. **Cell type must be specified** - "Code cell" or "Markdown cell" helps users understand the content type
3. **Current/active cell should be marked** - Use `aria-current="true"` or include "(current)" in label
4. **Selected cells should be indicated** - Multiple selection support: "(selected)"
5. **Execution status matters** - Code cells should indicate if they've been executed and if there are errors
6. **Hierarchy within cells** - Mark input, output, and toolbar areas as sub-regions
7. **Dynamic updates** - Update labels when:
   - Cell is selected or deselected
   - Cell becomes current/active
   - Cell is executed
   - Errors occur in execution
   - Cell content changes significantly

### Example Markup Structure

A complete Jupyter notebook cell in markup:

```tsx
<div
  role="region"
  aria-label="Code cell 5 (current, selected, has error)"
  aria-current="true"
  id="cell-uuid-xyz"
  className="jupyter-cell selected"
>
  {/* Cell input - code editor */}
  <div role="region" aria-label="Input for Code cell 5">
    <CodeMirrorEditor
    // ... editor props
    />
  </div>

  {/* Cell output - results/plots/etc */}
  <div role="region" aria-label="Output for Code cell 5 (has error)">
    <div className="cell-output error">{/* Error message and traceback */}</div>
  </div>

  {/* Cell toolbar - run, delete, etc */}
  <div role="region" aria-label="Controls for Code cell 5">
    <button aria-label="Run Code cell 5">
      <Icon name="play" />
    </button>
    <button aria-label="Delete Code cell 5">
      <Icon name="trash" />
    </button>
    {/* More buttons */}
  </div>
</div>
```

## Determining File Types for Dynamic Labels

To make `aria-label` dynamic with file type information, use the file extension or metadata. Here's a helper function pattern:

```tsx
function getFileTypeLabel(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();

  const typeMap: Record<string, string> = {
    ipynb: "Jupyter Notebook",
    py: "Python",
    r: "R",
    m: "Octave",
    md: "Markdown",
    txt: "Text",
    ts: "TypeScript",
    tsx: "TypeScript React",
    js: "JavaScript",
    jsx: "JavaScript React",
    java: "Java",
    cpp: "C++",
    c: "C",
    h: "C Header",
    go: "Go",
    rs: "Rust",
    // ... add more as needed
  };

  return typeMap[ext || ""] || "File";
}

// Usage:
const fileType = getFileTypeLabel("/path/to/analysis.ipynb"); // "Jupyter Notebook"
const ariaLabel = `${fileType} editor: ${filePath}`;
```

Alternatively, if you have metadata about the editor type:

```tsx
function getEditorTypeLabel(editorType: string, filePath: string): string {
  const fileName = filePath.split("/").pop();
  const typeLabels: Record<string, string> = {
    jupyter: "Jupyter Notebook",
    python: "Python",
    markdown: "Markdown",
    terminal: "Terminal",
    frame: "Frame Editor",
    // ...
  };

  const type = typeLabels[editorType] || "File";
  return `${type} editor: ${fileName}`;
}
```

## Implementation Guidelines for CoCalc

1. **Start at the root** (`app/page.tsx:363`) - Replace the outer `<div style={PAGE_STYLE}>` with `<main>`

2. **Mark navigation levels with context**:
   - Top nav: `<nav aria-label="Application navigation">`
   - File tabs: `<nav aria-label={`Open files in project: ${projectName}`}>`
   - Include project name and file names in labels for clarity

3. **Identify sidebars dynamically**:
   - Activity bar → `<aside aria-label={`Project activity bar for ${projectName}`}>`
   - Flyout panel → `<aside aria-label={`Sidebar for ${projectName}`}>`

4. **Use regions with full context** - In editors:
   - Main editor: `<div role="region" aria-label={`${fileType} editor: ${filePath}`}>`
   - Toolbars → `<div role="region" aria-label={`${fileType} editor toolbar for ${fileName}`}>`
   - Symbol panels → `<div role="region" aria-label={`Symbols and outline for ${fileName}`}>`

5. **Key principle: Context is everything**
   - Screen reader users benefit from knowing which file is being edited
   - Include the full path or at least the filename in the label
   - Include the file type (Python, Jupyter, etc.) for clarity
   - Avoid generic labels like "Editor" or "Content"

6. **Test with landmark navigation** - Use keyboard shortcuts in screen readers:
   - NVDA: `R` to jump to next landmark, `Shift+R` for previous
   - JAWS: `R` to jump to next landmark, `Shift+R` for previous
   - VoiceOver: Custom gestures depending on browser

## Resources

- [W3C WAI ARIA Landmarks](https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/)
- [MDN: ARIA Landmarks](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/main_role)
- [WebAIM: Landmark Regions](https://webaim.org/articles/screenreader_testing/#landmarks)
- [React Accessibility Guide](https://reactjs.org/docs/accessibility.html)

## Current Implementation Status

### ✅ Completed - October 2025

All 8 phases of ARIA landmark implementation have been successfully completed and tested:

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
