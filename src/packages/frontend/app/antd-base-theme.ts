/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { ThemeConfig } from "antd";

import { COLORS } from "@cocalc/util/theme";

export function getBaseAntdTheme(): ThemeConfig {
  return {
    token: {
      colorPrimary: COLORS.COCALC_BLUE,
      colorLink: COLORS.BLUE_DD,
      colorTextLightSolid: COLORS.TOP_BAR.ACTIVE,
      colorTextDescription: COLORS.GRAY_DD,
    },
  };
}
