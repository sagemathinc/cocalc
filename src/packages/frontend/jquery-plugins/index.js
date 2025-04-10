/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { init as initHeight } from "./height";
import { init as initIconSpin } from "./icon-spin";
import { init as initMisc } from "./misc";
import { init as initKatex } from "./katex-plugin";
import { init as initImages } from "./images";
import { init as initCodemirror } from "./codemirror";
import { init as initProcessLinks } from "../misc/process-links/jquery";
import { init as initProcessIcons } from "./process-icons";

export function init() {
  initHeight();
  initIconSpin();
  initMisc();
  initKatex();
  initImages();
  initCodemirror();
  initProcessLinks();
  initProcessIcons();
}
