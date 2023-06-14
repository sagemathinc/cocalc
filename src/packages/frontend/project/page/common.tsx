/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { COLORS } from "@cocalc/util/theme";

export const FIX_BORDER = `1px solid ${COLORS.GRAY_L0}`;

export const FIX_BORDERS: React.CSSProperties = {
  borderTop: FIX_BORDER,
  borderRight: FIX_BORDER,
} as const;
