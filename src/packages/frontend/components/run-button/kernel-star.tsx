/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { KERNEL_POPULAR_THRESHOLD } from "@cocalc/jupyter/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Icon } from "../icon";

// unify when a star is rendered with a kernel
export function KernelStar({ priority = 0 }: { priority?: number }) {
  if (priority < KERNEL_POPULAR_THRESHOLD) return null;

  return (
    <>
      {" "}
      <Icon name="star-filled" style={{ color: COLORS.YELL_L }} />
    </>
  );
}
