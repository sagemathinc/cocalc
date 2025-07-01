/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:ignore vbar

import { defineMessage } from "react-intl";

// in the other_settings map
export const VBAR_KEY = "vertical_fixed_bar";
export const VBAR_LABELS = `${VBAR_KEY}_labels`;
export const VBAR_LABELS_DEFAULT = true; // by default, we show the labels

export const VBAR_EXPLANATION = defineMessage({
  id: "project.page.vbar.explanation",
  defaultMessage: `This feature modifies the functionality of the project's left-side button bar.
  By default, it displays buttons for full pages and small caret signs for flyout panels.
  When selecting the "full pages" option, only buttons are shown, and they open full pages upon clicking.
  Conversely, when opting for the "flyout panels" mode, only flyout panels expand upon clicking.
  In both of the latter cases, the alternative panel type can be displayed by shift-clicking on the corresponding button.`,
});

export const VBAR_TOGGLE_LABELS = defineMessage({
  id: "project.page.vertical-fixed-tabs.toggle-labels",
  defaultMessage: "Show labels",
});

export const VBAR_TOGGLE_LABELS_DESCRIPTION = defineMessage({
  id: "project.page.vertical-fixed-tabs.toggle-labels.description",
  defaultMessage: "Show the description on the vertical action bar buttons",
});

export const VBAR_OPTIONS = {
  both: defineMessage({
    id: "project.page.vbar.option.both",
    defaultMessage: "Full pages and flyout panels",
  }),
  flyout: defineMessage({
    id: "project.page.vbar.option.flyout",
    defaultMessage: "Buttons toggle flyouts",
  }),
  full: defineMessage({
    id: "project.page.vbar.option.full",
    defaultMessage: "Buttons show full pages",
  }),
} as const;
