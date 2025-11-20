/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { ThemeConfig } from "antd";

import { COLORS } from "@cocalc/util/theme";

export function getBaseAntdTheme(): ThemeConfig {
  return {
    token: {
      colorLink: COLORS.BLUE_D,
      colorTextDescription: COLORS.GRAY_DD,
    },
  };
}
