/*
Top-level react component for editing Sage Worksheets.

Ultimately we'll have several views:

 - a single document view: one big editor, with output widgets (using either codemirror+hacks or prosemirror.)
 - cells view: many codemirror editors, one for each cell

Maybe
 - raw JSON lines view
 - just the input cells
 - just the output from that inputs
*/

import { createEditor } from "../frame-tree/editor";
import { set } from "../generic/misc";
import { CellWorksheet } from "./cell-worksheet";
import { DocumentWorksheet } from "./document-worksheet";

const worksheet_buttons = set([
  "print",
  "decrease_font_size",
  "increase_font_size",
  "save",
  "time_travel",
  "replace",
  "find",
  "goto_line",
  "cut",
  "paste",
  "copy",
  "undo",
  "redo",
  "format"
]);

const EDITOR_SPEC = {
  cells: {
    short: "Cells",
    name: "Cell Worksheet",
    icon: "code",
    component: CellWorksheet,
    buttons: worksheet_buttons
  },
  document: {
    short: "Document",
    name: "Document Worksheet",
    icon: "eye",
    component: DocumentWorksheet,
    buttons: worksheet_buttons
  }
};

export const Editor = createEditor({
  format_bar: true,
  editor_spec: EDITOR_SPEC,
  display_name: "SageWorksheetEditor"
});


