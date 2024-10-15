/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { alert_message } from "@cocalc/frontend/alerts";
import { ai_gen_formula } from "@cocalc/frontend/codemirror/extensions/ai-formula";
import { Locale } from "@cocalc/util/i18n";

export async function insertAIFormula(
  project_id: string,
  locale: Locale,
): Promise<string> {
  try {
    return await ai_gen_formula({ mode: "md", project_id, locale });
  } catch (err) {
    alert_message({ type: "error", message: err.errorFields[0]?.errors });
    return "";
  }
}
