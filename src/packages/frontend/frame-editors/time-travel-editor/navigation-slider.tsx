/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Slider } from "antd";
import { TimeAgo } from "../../components";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { type List } from "immutable";
import { type ReactNode, useMemo } from "react";
type VersionValue = string | number;

interface Props {
  versions?: List<VersionValue>;
  version?: VersionValue;
  setVersion: (v: VersionValue) => void;
  wallTime: (v: VersionValue) => number | undefined;
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

  const renderTooltip = (index: number) => {
    const id = versions.get(index);
    if (id == null) return;
    const date = wallTime(id);
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
        const id = versions.get(value);
        if (id != null) setVersion(id);
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

  const renderTooltip = (index: number) => {
    const id = versions?.get(index);
    if (id == null) return null;
    const t = wallTime(id);
    return t == null ? null : <TimeAgo date={new Date(t)} />;
  };

  const marks = useMemo(() => {
    if (versions == null) {
      return {};
    }
    const marks: { [value: number]: ReactNode } = {};
    versions.forEach((_, idx) => {
      marks[idx] = <span />;
    }
    );
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
      min={0}
      max={versions.size - 1}
      value={versions.indexOf(version!)}
      onChange={(idx) => {
        const id = versions.get(idx);
        if (id != null) setVersion(id);
      }}
      tooltip={{ formatter: renderTooltip, placement: "bottom" }}
    />
  );
}
