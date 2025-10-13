/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Shared STYLE constant for hashtag components
 * Used by task-editor/hashtag-bar.tsx
 */

import { COLORS } from "@cocalc/util/theme";

export const STYLE: React.CSSProperties = {
  // this is used externally for a consistent hashtag look; change carefully!
  maxHeight: "18ex",
  overflowY: "auto",
  overflowX: "hidden",
  border: "1px solid lightgrey",
  padding: "5px",
  background: COLORS.GRAY_LLL,
  borderRadius: "5px",
  marginBottom: "15px",
} as const;
