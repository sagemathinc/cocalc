/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Context carrying the per-document KaTeX macro map (parsed from the
.tex's \newcommand/\def/etc. by latex-macros.ts) to every math
renderer in a widget tree — including inline math nested arbitrarily
deep inside text-style widgets (e.g. \textbf{$x \in \R$}), which a prop
on the top-level widget can't reach. The widget-manager provides it
around each widget root; math renderers read it via useContext.
*/

import { createContext } from "react";

export const MathMacrosContext = createContext<
  Record<string, string> | undefined
>(undefined);
