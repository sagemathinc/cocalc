/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Transforms } from "slate";

import { alert_message } from "@cocalc/frontend/alerts";
import { ai_gen_formula } from "@cocalc/frontend/codemirror/extensions/ai-formula";
import { SlateEditor } from "../types";
import { getFocus } from "./commands";

export async function insertAIFormula(
  editor: SlateEditor,
  project_id: string,
): Promise<void> {
  try {
    const formula = await ai_gen_formula({ mode: "md", project_id });
    // We insert at what is likely the focus, rather than trying to
    // focus, since focusing is erratic (especially with firefox).
    Transforms.insertText(editor, formula, { at: getFocus(editor) });
  } catch (err) {
    alert_message({ type: "error", message: err.errorFields[0]?.errors });
    return;
  }
}
