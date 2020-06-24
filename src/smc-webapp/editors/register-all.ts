/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register all the editors.

One you add a new built in editor, it should go here.
*/

// Import each module, which loads a file editor.  These call register_file_editor.
// This should be a comprehensive list of all React editors

import "../chat/register";

import "./archive/actions";
import "../stopwatch/register";

// public read-only jupyter view (TODO: we are deprecating this, so...)
import { webapp_client } from "../webapp-client";
import { register as jupyter_register } from "../jupyter/nbviewer/register";
jupyter_register(webapp_client);

import "../tasks/register";
import "./media-viewer/register";

// Raw data editors
import "../editor-data/generic";

// All the non-react editors.
require("../editor").register_nonreact_editors();

// All the frame-tree editors
import "../frame-editors/register";
