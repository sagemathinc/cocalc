/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
EditorDescription for the interactive coding agent frame.
Import this spec in any editor that should include the coding agent panel.
*/

import { set } from "@cocalc/util/misc";
import type { EditorDescription } from "../frame-tree/types";
import CodingAgent from "./coding-agent";

export const coding_agent: EditorDescription = {
  type: "coding-agent",
  short: "Agent",
  name: "Coding Agent",
  icon: "robot",
  component: CodingAgent,
  commands: set(["decrease_font_size", "increase_font_size"]),
} as const;
