/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * Customized TimeAgo support
 * TODO: internationalize this formatter -- see https://www.npmjs.com/package/react-timeago
 */

import { Popover, Radio } from "antd";
import React, { CSSProperties as CSS } from "react";
import { default as UpstreamTimeAgo } from "react-timeago";
import { is_date, is_different as misc_is_different } from "@cocalc/util/misc";
import useAppContext from "@cocalc/frontend/app/use-context";

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
  date1: string | Date | number | undefined | null,
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
  click_to_toggle?: boolean;
}

export const TimeAgoElement: React.FC<TimeAgoElementProps> = ({
  placement,
  tip,
  live,
  time_ago_absolute,
  date,
  style,
  click_to_toggle,
}) => {
  if (live == null) live = true;

  if (placement == null) {
    placement = "top";
  }
  if (time_ago_absolute == null) {
    time_ago_absolute = false;
  }

  function render_timeago_element(d) {
    // See this bug -- https://github.com/nmn/react-timeago/issues/181
    return (
      <UpstreamTimeAgo
        key={d}
        title=""
        date={d}
        style={{ cursor: "pointer", ...style }}
        formatter={timeago_formatter}
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
    const el = render_timeago_element(d);
    if (!click_to_toggle) {
      return el;
    }
    return (
      <Popover
        trigger="click"
        title={s}
        content={() => (
          <>
            <div>{el}</div>
            {iso(d)}
            <ToggleRelativeAndAbsolute />
            {tip}
          </>
        )}
        placement={placement}
      >
        {el}
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
    const el = (
      <span
        style={{ cursor: click_to_toggle ? "pointer" : undefined, ...style }}
      >
        {s}
      </span>
    );
    if (!click_to_toggle) {
      return el;
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
        {el}
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
  click_to_toggle?: boolean; // default true
  time_ago_absolute?: boolean;
}

export const TimeAgo: React.FC<TimeAgoProps> = React.memo(
  ({
    placement,
    tip,
    live,
    style,
    date,
    click_to_toggle = true,
    time_ago_absolute,
  }: TimeAgoElementProps) => {
    const { timeAgoAbsolute } = useAppContext();

    if (date == null) {
      return <></>;
    }

    return (
      <TimeAgoElement
        date={date}
        placement={placement}
        tip={tip}
        live={live}
        time_ago_absolute={time_ago_absolute ?? timeAgoAbsolute ?? false}
        style={style}
        click_to_toggle={click_to_toggle}
      />
    );
  },
  (props, next) => {
    // areEqual
    return !(
      is_different_date(props.date, next.date) ||
      misc_is_different(props, next, [
        "placement",
        "tip",
        "live",
        "click_to_toggle",
        "style",
        "time_ago_absolute",
      ])
    );
  },
);

function ToggleRelativeAndAbsolute({}) {
  const { timeAgoAbsolute, setTimeAgoAbsolute } = useAppContext();
  if (setTimeAgoAbsolute == null) {
    return null;
  }

  return (
    <div style={{ marginTop: "10px", textAlign: "center" }}>
      <Radio.Group
        onChange={() => {
          setTimeAgoAbsolute?.(!timeAgoAbsolute);
        }}
        value={timeAgoAbsolute ? "absolute" : "relative"}
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

/*
I had to disable this for now since @cocalc/frontend/i18n doesn't support the nextjs app.

//import { labels } from "@cocalc/frontend/i18n";

 import { useIntl } from "react-intl";
const intl = useIntl();
        <Radio value="relative">{intl.formatMessage(labels.relative)}</Radio>
        <Radio value="absolute">{intl.formatMessage(labels.absolute)}</Radio>

*/
