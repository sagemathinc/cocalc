/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Top-level react component for Sage Worksheets.  The only goal is to make it
very easy to convert to a Jupyter Notebook.
*/

import { createEditor } from "../frame-tree/editor";
import Convert from "./convert";

const convert = {
  type: "sagews-convert",
  short: "Convert",
  name: "Convert Sagews",
  icon: "file-alt",
  component: Convert,
} as const;

const EDITOR_SPEC = {
  convert,
} as const;

export const Editor = createEditor({
  format_bar: true,
  editor_spec: EDITOR_SPEC,
  display_name: "SageWorksheetEditor",
});
