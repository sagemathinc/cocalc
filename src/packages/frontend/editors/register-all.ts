/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Register all the editors.

One you add a new built in editor, it should go here.
*/

// Import each module, which loads a file editor.  These call register_file_editor.
// This should be a comprehensive list of all React editors

import "./archive/actions";
import "./stopwatch/register";
import "./media-viewer/register";

// Raw data editors
import "./data-editor/generic";

// All the frame-tree editors
import "../frame-editors/register";

// Unknown files
import "./unknown/register";

// Ensure that we load all the codemirror plugins, modes, etc.
import "@cocalc/frontend/codemirror/init";

// CSS for the lightweight (< 1MB) nextjs friendly CodeEditor
// component (in components/code-editor).
// This is only for making this editro work in this frontend app.
// This dist.css is only 7K.
import "@uiw/react-textarea-code-editor/dist.css";
