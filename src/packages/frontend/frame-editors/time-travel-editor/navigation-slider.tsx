/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Slider } from "antd";
import { TimeAgo } from "../../components";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { type List } from "immutable";
import { type ReactNode, useMemo } from "react";

interface Props {
  versions?: List<number>;
  version?: number;
  setVersion: (number) => void;
  wallTime: (number) => number;
}

export function NavigationSlider({
  marks,
  ...props
}: Props & { marks?: boolean }) {
  if (marks) {
    return <NavigationSliderMarks {...props} />;
  } else {
    return <NavigationSliderNoMarks {...props} />;
  }
}

function NavigationSliderNoMarks({
  version,
  versions,
  setVersion,
  wallTime,
}: Props) {
  const { isVisible } = useFrameContext();
  if (versions == null || version == null || !isVisible) {
    return null;
  }

  const renderTooltip = (index) => {
    const date = wallTime(versions.get(index));
    if (date == null) return; // shouldn't happen
    return <TimeAgo date={date} />;
  };

  return (
    <Slider
      style={{ margin: "10px 15px" }}
      min={0}
      max={versions.size - 1}
      value={versions.indexOf(version)}
      onChange={(value) => {
        setVersion(versions.get(value));
      }}
      tooltip={{ formatter: renderTooltip, placement: "bottom" }}
    />
  );
}

// This lays the marks out with dots spread by when they actually happened, like
// a timeline.  It is sometimes very nice and sometimes very annoying.

function NavigationSliderMarks({
  version,
  versions,
  setVersion,
  wallTime,
}: Props) {
  const { isVisible } = useFrameContext();

  const renderTooltip = (version) => {
    return <TimeAgo date={new Date(wallTime(version))} />;
  };

  const marks = useMemo(() => {
    if (versions == null) {
      return {};
    }
    const marks: { [value: number]: ReactNode } = {};
    for (const v of versions) {
      marks[v] = <span />;
    }
    return marks;
  }, [versions]);

  if (versions == null || version == null || !isVisible || versions.size <= 0) {
    return null;
  }

  return (
    <Slider
      marks={marks}
      included={false}
      step={null}
      style={{ margin: "10px 15px" }}
      min={versions.get(0)!}
      max={versions.get(-1)!}
      value={version}
      onChange={setVersion}
      tooltip={{ formatter: renderTooltip, placement: "bottom" }}
    />
  );
}
