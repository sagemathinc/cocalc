/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Our predefined terminal color themes.
*/

import { ITheme, Terminal } from "xterm";
import { color_themes } from "./theme-data";

export function background_color(theme_name: string): string {
  const t = color_themes[theme_name];
  if (t == null) {
    // should never happen
    return "white";
  }
  return t.colors[17];
}

export function setTheme(terminal: Terminal, theme_name: string): void {
  let t = color_themes[theme_name];
  if (t == null) {
    t = color_themes["default"];
    if (t == null) {
      // can't happen
      return;
    }
  }
  const colors = t.colors;
  if (colors == null) {
    // satisfies typescript
    return;
  }
  const theme: ITheme = {
    background: colors[17],
    foreground: colors[16],
    cursor: colors[16],
    cursorAccent: colors[17],
    selection: "rgba(128, 128, 160, 0.25)",
    black: colors[0],
    red: colors[1],
    green: colors[2],
    yellow: colors[3],
    blue: colors[4],
    magenta: colors[5],
    cyan: colors[6],
    white: colors[7],
    brightBlack: colors[8],
    brightRed: colors[9],
    brightGreen: colors[10],
    brightYellow: colors[11],
    brightBlue: colors[12],
    brightMagenta: colors[13],
    brightCyan: colors[14],
    brightWhite: colors[15],
  };
  terminal.setOption("theme", theme);
}
