/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * Customized TimeAgo support
 * TODO: internationalize this formatter -- see https://www.npmjs.com/package/react-timeago
 */

import React, { CSSProperties as CSS } from "react";
import { default as UpstreamTimeAgo } from "react-timeago";
import { useTypedRedux, redux } from "@cocalc/frontend/app-framework";
import { is_date, is_different as misc_is_different } from "@cocalc/util/misc";
import { Popover, Radio } from "antd";

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
// is a *chance* they are different
export function is_different_date(
  date0: string | Date | number | undefined | null,
  date1: string | Date | number | undefined | null
): boolean {
  const t0 = typeof date0;
  const t1 = typeof date1;
  if (t0 !== t1) {
    return true;
  }
  if (
    date0 == null ||
    date1 == null ||
    typeof date0 != "object" ||
    typeof date1 != "object"
  ) {
    return date0 !== date1;
  }
  return date0.valueOf() - date1.valueOf() != 0;
}

interface TimeAgoElementProps {
  placement?;
  tip?: string | JSX.Element; // optional body of the tip popover with title the original time.
  live?: boolean; // whether or not to auto-update
  date;
  time_ago_absolute?: boolean;
  style?: CSS;
  minPeriod?: number;
}

export const TimeAgoElement: React.FC<TimeAgoElementProps> = ({
  placement,
  tip,
  live,
  time_ago_absolute,
  date,
  style,
  minPeriod,
}) => {
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
        style={{ cursor: "pointer", ...style }}
        formatter={timeago_formatter}
        minPeriod={minPeriod}
        live={live}
      />
    );
  }

  function iso(d) {
    try {
      return <div style={{ color: "#666" }}>{d.toISOString()}</div>;
    } catch (err) {
      return `${err}`;
    }
  }

  function render_timeago(d) {
    let s;
    try {
      s = d.toLocaleString();
    } catch (err) {
      s = `${err}`;
    }
    return (
      <Popover
        trigger="click"
        title={s}
        content={() => (
          <>
            <div>{render_timeago_element(d)}</div>
            {iso(d)}
            <ToggleRelativeAndAbsolute />
            {tip}
          </>
        )}
        placement={placement}
      >
        {render_timeago_element(d)}
      </Popover>
    );
  }

  function render_absolute(d) {
    let s;
    try {
      s = d.toLocaleString();
    } catch (err) {
      s = `${err}`;
    }
    return (
      <Popover
        trigger="click"
        title={s}
        content={() => (
          <>
            {render_timeago_element(d)}
            {iso(d)}
            <ToggleRelativeAndAbsolute />
          </>
        )}
        placement={placement}
      >
        <span style={{ cursor: "pointer", ...style }}>{s}</span>
      </Popover>
    );
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
  placement?;
  tip?: string | JSX.Element; // optional body of the tip popover with title the original time.
  live?: boolean; // whether or not to auto-update
  style?: CSS;
  date?;
  minPeriod?: number;
  time_ago_absolute?: boolean;
}

export const TimeAgo: React.FC<TimeAgoProps> = React.memo(
  (props: TimeAgoElementProps) => {
    const { placement, tip, live, style, date, minPeriod, time_ago_absolute } =
      props;

    const other_settings = useTypedRedux("account", "other_settings");
    if (date == null) return <></>;

    return (
      <TimeAgoElement
        date={date}
        placement={placement}
        tip={tip}
        live={live}
        time_ago_absolute={
          time_ago_absolute ?? other_settings.get("time_ago_absolute") ?? false
        }
        style={style}
        minPeriod={minPeriod}
      />
    );
  },
  (props, next) => {
    // areEqual
    return !(
      is_different_date(props.date, next.date) ||
      misc_is_different(props, next, ["placement", "tip", "live"])
    );
  }
);

function ToggleRelativeAndAbsolute({}) {
  const other = useTypedRedux("account", "other_settings");
  const absolute = other?.get("time_ago_absolute") ?? false;

  return (
    <div style={{ marginTop: "10px", textAlign: "center" }}>
      <Radio.Group
        onChange={() => {
          redux
            .getActions("account")
            .set_other_settings("time_ago_absolute", !absolute);
        }}
        value={absolute ? "absolute" : "relative"}
        optionType="button"
        buttonStyle="solid"
        size="small"
      >
        <Radio value="relative">Relative</Radio>
        <Radio value="absolute">Absolute</Radio>
      </Radio.Group>
    </div>
  );
}
