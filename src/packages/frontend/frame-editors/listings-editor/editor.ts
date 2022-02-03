/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Spec for file listing frame tree editor.
*/

import { EditorDescription } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { createEditor } from "@cocalc/frontend/frame-editors/frame-tree/editor";
import { set } from "@cocalc/util/misc";
import { terminal } from "@cocalc/frontend/frame-editors/terminal-editor/editor";
import Listing from "./listing";
import { file_associations } from "@cocalc/frontend/file-associations";

const filesButtons = set([
  "decrease_font_size",
  "increase_font_size",
  "zoom_page_width",
  "zoom_page_height",
  "save",
]);

export const EDITOR_SPEC = {
  files: {
    short: file_associations["files"].name,
    name: file_associations["files"].name,
    icon: file_associations["files"].icon,
    component: Listing,
    buttons: filesButtons,
  } as EditorDescription,
  terminal,
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "Files",
});
