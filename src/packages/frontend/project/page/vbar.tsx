/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// in the other_settings map
export const VBAR_KEY = "vertical_fixed_bar";

export const VBAR_EXPLANATION = (
  <>
    This feature modifies the functionality of the project's left-side button
    bar. By default, it displays buttons for full pages and small caret signs
    for flyout panels. When selecting the "full pages" option, only buttons are
    shown, and they open full pages upon clicking. Conversely, when opting for
    the "flyout panels" mode, only flyout panels expand upon clicking. In both
    of the latter cases, the alternative panel type can be displayed by
    shift-clicking on the corresponding button.
  </>
);

export const VBAR_OPTIONS = {
  both: "Full pages and flyout panels",
  flyout: "Buttons expand/collapse compact flyouts",
  full: "Buttons show full pages",
} as const;

type VbarName = keyof typeof VBAR_OPTIONS;

// Tweak this function to change the default mode for the buttons on the vertical bar.
// See commit 7eaa96ed6ddbe5851765b0f08224abfd8885e65e for an abandoned idea to base this on the
// account creation time – i.e. to change this for new users.
function getDefaultVBAROption(): VbarName {
  return "both";
}

export function getValidVBAROption(
  vbar_setting: any
): keyof typeof VBAR_OPTIONS {
  if (typeof vbar_setting !== "string" || VBAR_OPTIONS[vbar_setting] == null) {
    return getDefaultVBAROption();
  }
  return vbar_setting as VbarName;
}
