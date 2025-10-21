import { replace_all } from "@cocalc/util/misc";

export const COLOR_THEMES = {
  "solarized-dark": {
    comment: "Solarized dark",
    colors: [
      "#eee8d5",
      "#dc322f",
      "#859900",
      "#b58900",
      "#268bd2",
      "#d33682",
      "#2aa198",
      "#073642",
      "#fdf6e3",
      "#cb4b16",
      "#93a1a1",
      "#839496",
      "#657b83",
      "#6c71c4",
      "#586e75",
      "#002b36",
      "#eee8d5",
      "#002b36",
    ],
  },
  "solarized-light": {
    comment: "Solarized light",
    colors: [
      "#073642",
      "#dc322f",
      "#859900",
      "#b58900",
      "#268bd2",
      "#d33682",
      "#2aa198",
      "#eee8d5",
      "#002b36",
      "#cb4b16",
      "#586e75",
      "#657b83",
      "#839496",
      "#6c71c4",
      "#93a1a1",
      "#fdf6e3",
      "#073642",
      "#fdf6e3",
    ],
  },
  "cocalc-light": {
    comment: "CoCalc Light",
    colors: [
      "#2d4f8a", // color0: dark blue (based on COCALC_BLUE darkened)
      "#d97706", // color1: orange/red for errors (based on COCALC_ORANGE darkened)
      "#5b8e3a", // color2: green
      "#f59e0b", // color3: yellow/gold (harmonized with COCALC_ORANGE)
      "#4474c0", // color4: COCALC_BLUE (main text accent)
      "#8b68a6", // color5: purple
      "#3e999f", // color6: cyan
      "#d0d0d0", // color7: light gray
      "#6e8090", // color8: medium gray
      "#ea580c", // color9: bright orange (for numbers, based on COCALC_ORANGE)
      "#7cb342", // color10: bright green
      "#fcc861", // color11: COCALC_ORANGE (bright yellow/gold)
      "#6690d2", // color12: lighter blue (from CoCalc theme.ts BLUE)
      "#b084cc", // color13: bright purple
      "#50c0c8", // color14: bright cyan
      "#e8e8e8", // color15: very light gray
      "#2d4f8a", // foreground: dark blue (main text, based on COCALC_BLUE)
      "#fbfbfb", // background
    ],
  },
  "cocalc-dark": {
    comment: "CoCalc Dark",
    colors: [
      "#c0d4f0", // color0: light blue-gray (for dark bg)
      "#ff9966", // color1: soft orange for errors (lightened COCALC_ORANGE)
      "#88c070", // color2: soft green
      "#fcc861", // color3: COCALC_ORANGE (yellow/gold)
      "#80afff", // color4: BLUE_L from theme.ts (main text accent)
      "#b89dd8", // color5: light purple
      "#66cccc", // color6: bright cyan
      "#808080", // color7: medium gray
      "#a0a0a0", // color8: lighter gray
      "#ffb380", // color9: bright orange (for numbers, lightened COCALC_ORANGE)
      "#a5d68a", // color10: brighter green
      "#ffdb99", // color11: very light orange/gold
      "#94b3e5", // color12: BLUE_LL from theme.ts
      "#d4b8f0", // color13: bright purple
      "#88e8e8", // color14: very bright cyan
      "#e0e0e0", // color15: light gray (GRAY_L0)
      "#c0d4f0", // foreground: light blue-gray (main text)
      "#434343", // background: GRAY_D from theme.ts
    ],
  },
  "low-contrast": {
    comment: "Low contrast dark",
    colors: [
      "#222222",
      "#9e5641",
      "#6c7e55",
      "#caaf2b",
      "#7fb8d8",
      "#956d9d",
      "#4c8ea1",
      "#808080",
      "#454545",
      "#cc896d",
      "#c4df90",
      "#ffe080",
      "#b8ddea",
      "#c18fcb",
      "#6bc1d0",
      "#cdcdcd",
      "#cdcdcd",
      "#343434",
    ],
  },
  "raven-dark": {
    comment: "Raven dark",
    colors: [
      "#3f3e3b",
      "#b36b65",
      "#4f8c61",
      "#8d7e45",
      "#6181b8",
      "#a46d9d",
      "#0e8e9a",
      "#b6b7bb",
      "#7f7f83",
      "#efa29b",
      "#86c596",
      "#c7b679",
      "#9ab9f3",
      "#dfa4d7",
      "#5ec7d4",
      "#feffff",
      "#a6a7aa",
      "#32312e",
    ],
  },
  default: {
    comment: "Default black on white",
    colors: [
      "#2e3436",
      "#cc0000",
      "#4e9a06",
      "#c4a000",
      "#3465a4",
      "#75507b",
      "#06989a",
      "#d3d7cf",
      "#555753",
      "#ef2929",
      "#8ae234",
      "#fce94f",
      "#729fcf",
      "#ad7fa8",
      "#34e2e2",
      "#eeeeec",
      "#000000",
      "#ffffff",
    ],
  },
  mono: {
    comment: "Monochrome dark",
    colors: [
      "#000000",
      "#434343",
      "#6b6b6b",
      "#969696",
      "#4a4a4a",
      "#707070",
      "#a9a9a9",
      "#ffffff",
      "#222222",
      "#434343",
      "#a5a5a5",
      "#e5e5e5",
      "#4d4d4d",
      "#747474",
      "#c4c4c4",
      "#dedede",
      "#b0b0b0",
      "#282828",
    ],
  },
  tango: {
    comment: "Tango light",
    colors: [
      "#2e3436",
      "#cc0000",
      "#4e9a06",
      "#c4a000",
      "#3465a4",
      "#75507b",
      "#06989a",
      "#d3d7cf",
      "#555753",
      "#ef2929",
      "#8ae234",
      "#fce94f",
      "#729fcf",
      "#ad7fa8",
      "#34e2e2",
      "#eeeeec",
      "#000000",
      "#ffffff",
    ],
  },
  infred: {
    comment: "Infinite red dark",
    colors: [
      "#6c6c6c",
      "#e9897c",
      "#b6e77d",
      "#ecebbe",
      "#a9cdeb",
      "#ea96eb",
      "#c9caec",
      "#f2f2f2",
      "#747474",
      "#f99286",
      "#c3f786",
      "#fcfbcc",
      "#b6defb",
      "#fba1fb",
      "#d7d9fc",
      "#e2e2e2",
      "#f2f2f2",
      "#101010",
    ],
  },
  "raven-light": {
    comment: "Raven light",
    colors: [
      "#e7dfd5",
      "#f46864",
      "#00ae58",
      "#ac9510",
      "#389bff",
      "#dc6dd2",
      "#00b0cc",
      "#5b636b",
      "#8f98a1",
      "#b42b33",
      "#007525",
      "#726000",
      "#0066cb",
      "#a03398",
      "#007793",
      "#00020e",
      "#69717a",
      "#faf0e6",
    ],
  },
} as const;

// Use theme_desc for UI to select a theme.

export const theme_desc = {};
for (const name in COLOR_THEMES) {
  theme_desc[name] = COLOR_THEMES[name].comment;
}

// This is a cheap hardcoded example for use in configuration/settings.
// It shows a terminal prompt, cat command, file output, and final prompt.
export function example(theme: string): string {
  let html = `<div style="background-color: #ffffff; color: #000000; font-family: monospace, monospace; line-height: 120%; width: 100%; border:1px solid grey;padding:5px">
<div><span style="color:#4e9a06;">user@cocalc</span>:<span style="color:#3465a4;">~/project</span>$ cat prime_test.py</div>
<div><span style="color:#c4a000;">def</span>&nbsp;<span style="color:#06989a;">is_prime_lucas_lehmer</span>(p):</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#cc0000;">"""</span></div>
<div><span style="color:#cc0000;">&nbsp;&nbsp;&nbsp;&nbsp;Test&nbsp;primality&nbsp;of&nbsp;Mersenne&nbsp;number&nbsp;2**p&nbsp;-&nbsp;1.</span></div>
<div>&nbsp;</div>
<div><span style="color:#75507b;">&nbsp;&nbsp;&nbsp;&nbsp;&gt;&gt;&gt;&nbsp;is_prime_lucas_lehmer(</span><span style="color:#cc0000;">107</span><span style="color:#75507b;">)</span></div>
<div><span style="color:#75507b;">&nbsp;&nbsp;&nbsp;&nbsp;True</span></div>
<div><span style="color:#75507b;">&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="color:#cc0000;">"""</span></div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;k&nbsp;=&nbsp;<span style="color:#cc0000;">2</span>**p&nbsp;-&nbsp;<span style="color:#cc0000;">1</span>;&nbsp;s&nbsp;=&nbsp;<span style="color:#cc0000;">4</span></div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#c4a000;">for</span>&nbsp;i&nbsp;<span style="color:#c4a000;">in</span>&nbsp;<span style="color:#06989a;">range</span>(<span style="color:#cc0000;">3</span>,&nbsp;p+<span style="color:#cc0000;">1</span>):</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;s&nbsp;=&nbsp;(s*s&nbsp;-&nbsp;<span style="color:#cc0000;">2</span>)&nbsp;%&nbsp;k</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#c4a000;">return</span>&nbsp;s&nbsp;==&nbsp;<span style="color:#cc0000;">0</span></div>
<div><span style="color:#4e9a06;">user@cocalc</span>:<span style="color:#3465a4;">~/project</span>$</div>
</div>`;
  // The above snippet was created by using xterm.js with the default theme.
  // To get an example for our theme, we substitute the colors.
  const a = COLOR_THEMES.default.colors;
  const b = COLOR_THEMES[theme]?.colors;
  if (!b) throw Error(`unknown theme ${theme}`);
  for (let i = 0; i < a.length; i++) {
    html = replace_all(html, a[i], b[i]);
  }
  return html;
}
