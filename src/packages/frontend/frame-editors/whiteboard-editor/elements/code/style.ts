/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CSSProperties } from "react";

import { Element } from "../../types";

export default function getStyle(element: Element): CSSProperties {
  return {
    height: "100%",
    overflowY: "auto",
    fontSize: element.data?.fontSize,
    border: element.data?.radius
      ? `${2 * (element.data?.radius ?? 1)}px solid ${
          element.data?.color ?? "#ccc"
        }`
      : undefined,
    borderRadius: "3px",
    padding: "5px",
    background: "white",
  };
}
