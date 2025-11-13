/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { defineMessage } from "react-intl";

// in the other_settings map
export const ACTIVITY_BAR_KEY = "vertical_fixed_bar";
export const ACTIVITY_BAR_LABELS = `${ACTIVITY_BAR_KEY}_labels`;
export const ACTIVITY_BAR_LABELS_DEFAULT = true; // by default, we show the labels

export const TOGGLE_ACTIVITY_BAR_TOGGLE_BUTTON_SPACE = "5px";

export const ACTIVITY_BAR_TITLE = defineMessage({
  id: "project.page.activity-bar.title",
  defaultMessage: "Activity Bar",
  description:
    "Name of the vertical activity bar on the left side of the project page",
});

export const ACTIVITY_BAR_EXPLANATION = defineMessage({
  id: "project.page.activity-bar.explanation",
  defaultMessage: `This feature modifies the functionality of the project's left-side activity bar.
  By default, it displays buttons for full pages and small caret signs for flyout panels.
  When selecting the "full pages" option, only buttons are shown, and they open full pages upon clicking.
  Conversely, when opting for the "flyout panels" mode, only flyout panels expand upon clicking.
  In both of the latter cases, the alternative panel type can be displayed by shift-clicking on the corresponding button.`,
});

export const ACTIVITY_BAR_TOGGLE_LABELS = defineMessage({
  id: "project.page.activity-bar.toggle-labels",
  defaultMessage: "{show, select, true {Hide labels} other {Show labels}}",
});

export const ACTIVITY_BAR_TOGGLE_LABELS_DESCRIPTION = defineMessage({
  id: "project.page.activity-bar.toggle-labels.description",
  defaultMessage: "Show the description on the vertical activity bar buttons",
});

export const ACTIVITY_BAR_OPTIONS = {
  both: defineMessage({
    id: "project.page.activity-bar.option.both",
    defaultMessage: "Full pages and flyout panels",
  }),
  flyout: defineMessage({
    id: "project.page.activity-bar.option.flyout",
    defaultMessage: "Buttons toggle flyouts",
  }),
  full: defineMessage({
    id: "project.page.activity-bar.option.full",
    defaultMessage: "Buttons show full pages",
  }),
} as const;
