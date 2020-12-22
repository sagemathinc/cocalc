/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// get these from sage/misc/latex.py
// This same info is **also** embedded in cocalc/src/smc-util/mathjax-config.js
export const macros = {
  "\\Bold": "\\mathbb{#1}",
  "\\ZZ": "\\Bold{Z}",
  "\\NN": "\\Bold{N}",
  "\\RR": "\\Bold{R}",
  "\\CC": "\\Bold{C}",
  "\\FF": "\\Bold{F}",
  "\\QQ": "\\Bold{Q}",
  "\\QQbar": "\\overline{\\QQ}",
  "\\CDF": "\\Bold{C}",
  "\\CIF": "\\Bold{C}",
  "\\CLF": "\\Bold{C}",
  "\\RDF": "\\Bold{R}",
  "\\RIF": "\\Bold{I} \\Bold{R}",
  "\\RLF": "\\Bold{R}",
  "\\CFF": "\\Bold{CFF}",
  "\\GF": "\\Bold{F}_{#1}",
  "\\Zp": "\\ZZ_{#1}",
  "\\Qp": "\\QQ_{#1}",
  "\\Zmod": "\\ZZ/#1\\ZZ",
} as const;
