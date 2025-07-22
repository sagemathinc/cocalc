/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CSSProperties } from "react";
import { useIntl } from "react-intl";
import FakeProgress from "@cocalc/frontend/components/fake-progress";
import { TypedMap, useDelayedRender } from "@cocalc/frontend/app-framework";
import { labels } from "@cocalc/frontend/i18n";
import { Icon } from "./icon";

export type Estimate = TypedMap<{
  time: number; // Time in seconds
  type: "new" | "ready" | "archived";
}>;
export const Estimate = null; // webpack + TS es2020 modules need this

interface Props {
  style?: CSSProperties;
  text?: string;
  estimate?: Estimate | number;
  theme?: "medium" | undefined;
  delay?: number; // (default:1000) don't show anything until after delay milliseconds.  The component could easily unmount by then, and hence never annoyingly flicker on screen.
  transparent?: boolean;
}

const LOADING_THEMES: { [keys: string]: CSSProperties } = {
  medium: {
    fontSize: "24pt",
    textAlign: "center",
    marginTop: "15px",
    color: "#888",
    background: "white",
  },
} as const;

export function Loading({
  style,
  text,
  estimate,
  theme,
  delay = 1000,
  transparent = false,
}: Props) {
  const intl = useIntl();

  const render = useDelayedRender(delay ?? 0);
  if (!render) {
    return <></>;
  }

  return (
    <div
      style={{
        ...(theme ? LOADING_THEMES[theme] : undefined),
        ...(transparent ? { background: "transparent" } : undefined),
        ...style,
      }}
    >
      <span>
        <Icon name="cocalc-ring" spin />{" "}
        {text ?? intl.formatMessage(labels.loading)}
      </span>
      {estimate != undefined && (
        <div>
          <FakeProgress
            time={
              typeof estimate == "number"
                ? estimate
                : 1000 * estimate.get("time")
            }
          />
        </div>
      )}
    </div>
  );
}
