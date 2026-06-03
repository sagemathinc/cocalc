/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
LaTeX font-size declarations, as supported by the rich-edit widgets.

We ONLY handle the *braced* form `{\Large …}` — a self-delimited group.
The bare-declaration form (`\Large` affecting the rest of a paragraph /
group, with no braces) is deliberately NOT rendered: tracking that scope
is brittle, and the toolbar always inserts the braced form anyway. A
bare `\Large` stays as raw source (fail-open).

`FONT_SIZE_EM` maps each size command (name WITHOUT the leading
backslash) to an approximate CSS `font-size` multiple of the surrounding
text, following the LaTeX 10pt-class size ladder. These are previews —
the real sizes come from the PDF compile.
*/

export const FONT_SIZE_EM: Readonly<Record<string, number>> = {
  tiny: 0.5,
  scriptsize: 0.7,
  footnotesize: 0.8,
  small: 0.9,
  normalsize: 1.0,
  large: 1.2,
  Large: 1.44,
  LARGE: 1.73,
  huge: 2.07,
  Huge: 2.49,
};

/** The set of recognized size command names (without backslash). */
export const FONT_SIZE_NAMES: ReadonlySet<string> = new Set(
  Object.keys(FONT_SIZE_EM),
);
