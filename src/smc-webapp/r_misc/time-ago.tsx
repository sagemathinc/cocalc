/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * Customized TimeAgo support
 * TODO: internationalize this formatter -- see https://www.npmjs.com/package/react-timeago
 */

import { default as UpstreamTimeAgo } from "react-timeago";
import { CSS, React, useTypedRedux } from "../app-framework";
import { is_date, is_different as misc_is_different } from "smc-util/misc";
import { Tip } from "./tip";
import { TooltipPlacement } from "antd/es/tooltip";

function timeago_formatter(value, unit, suffix, _date) {
  if (value === 0) {
    return "now";
  }
  if (unit === "second") {
    return `less than a minute ${suffix}`;
  }
  if (value !== 1) {
    unit += "s";
  }
  return `${value} ${unit} ${suffix}`;
}

// This is just used for updates, so is_different if there
// is a chance they are different
export function is_different_date(
  date0: string | Date | number | undefined,
  date1: string | Date | number | undefined
): boolean {
  const t0 = typeof date0;
  const t1 = typeof date1;
  if (t0 !== t1) {
    return true;
  }
  if (typeof date0 != "object" || typeof date1 != "object") {
    return date0 !== date1;
  }
  return date0.valueOf() - date1.valueOf() != 0;
}

interface TimeAgoElementProps {
  popover?: boolean;
  placement?: TooltipPlacement;
  tip?: string | JSX.Element; // optional body of the tip popover with title the original time.
  live?: boolean; // whether or not to auto-update
  date: string | Date | number;
  time_ago_absolute?: boolean;
  style?: CSS;
  minPeriod?: number;
}

export const TimeAgoElement: React.FC<TimeAgoElementProps> = ({
  popover,
  placement,
  tip,
  live,
  time_ago_absolute,
  date,
  style,
  minPeriod,
}) => {
  if (popover == null) popover = true;
  if (live == null) live = true;

  // "minPeriod and maxPeriod now accept seconds not milliseconds. This matches the documentation."
  // Also, given our custom formatter, anything more frequent than about 45s is pointless (since we don't show seconds)
  if (minPeriod == null) minPeriod = 45;
  if (placement == null) placement = "top";
  if (time_ago_absolute == null) time_ago_absolute = false;

  function render_timeago_element(d) {
    return (
      <UpstreamTimeAgo
        title=""
        date={d}
        style={style}
        formatter={timeago_formatter}
        minPeriod={minPeriod}
        live={live}
      />
    );
  }

  function render_timeago(d) {
    if (popover) {
      let s;
      try {
        s = d.toLocaleString();
      } catch (err) {
        s = `${err}`;
      }
      return (
        <Tip title={s} tip={tip} placement={placement}>
          {render_timeago_element(d)}
        </Tip>
      );
    } else {
      return render_timeago_element(d);
    }
  }

  function render_absolute(d) {
    let s;
    try {
      s = d.toLocaleString();
    } catch (err) {
      s = `${err}`;
    }
    return <span>{s}</span>;
  }

  const d = is_date(date) ? (date as Date) : new Date(date);
  try {
    d.toISOString();
  } catch (error) {
    // NOTE: Using isNaN might not work on all browsers, so we use try/except
    // See https://github.com/sagemathinc/cocalc/issues/2069
    return <span>Invalid Date</span>;
  }

  if (time_ago_absolute) {
    return render_absolute(d);
  } else {
    return render_timeago(d);
  }
};

interface TimeAgoProps {
  popover?: boolean;
  placement?: TooltipPlacement;
  tip?: string | JSX.Element; // optional body of the tip popover with title the original time.
  live?: boolean; // whether or not to auto-update
  style?: CSS;
  date: string | Date | number | undefined;
}

export const TimeAgo: React.FC<TimeAgoProps> = React.memo(
  ({ popover, placement, tip, live, style, date }) => {
    const other_settings = useTypedRedux("account", "other_settings");
    if (date == null) return <></>;

    return (
      <TimeAgoElement
        date={date}
        popover={popover}
        placement={placement}
        tip={tip}
        live={live}
        time_ago_absolute={other_settings.get("time_ago_absolute") ?? false}
        style={style}
      />
    );
  },
  (props, next) => {
    return (
      is_different_date(props.date, next.date) ||
      misc_is_different(props, next, ["popover", "placement", "tip", "live"])
    );
  }
);
