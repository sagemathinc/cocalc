/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties } from "react";
import { Icon } from "./icon";
import { TypedMap, useDelayedRender } from "../app-framework";

export type Estimate = TypedMap<{
  time: number; // Time in seconds
  type: "new" | "ready" | "archived";
}>;
export const Estimate = null; // webpack + TS es2020 modules need this

interface Props {
  style?: CSSProperties;
  text?: string;
  estimate?: Estimate;
  theme?: "medium" | undefined;
  delay?: number; // if given, don't show anything until after delay milliseconds.  The component could easily unmount by then, and hence never annoyingly flicker on screen.
}

const LOADING_THEMES: { [keys: string]: CSSProperties } = {
  medium: {
    fontSize: "24pt",
    textAlign: "center",
    marginTop: "15px",
    color: "#888",
    background: "white",
  },
};

export function Loading({ style, text, estimate, theme, delay }: Props) {
  const render = useDelayedRender(delay ?? 0);
  if (!render) {
    return <></>;
  }

  return (
    <div
      style={{
        ...(theme ? LOADING_THEMES[theme] : undefined),
        ...style,
      }}
    >
      <span>
        <Icon name="cocalc-ring" spin /> {text ?? "Loading..."}
      </span>
      {estimate != undefined && (
        <div>
          Loading '{estimate.get("type")}' file.
          <br />
          Estimated time: {estimate.get("time")}s
        </div>
      )}
    </div>
  );
}
