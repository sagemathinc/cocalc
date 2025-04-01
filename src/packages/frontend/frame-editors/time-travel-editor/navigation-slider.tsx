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
}

export function NavigationSlider({ version, versions, setVersion }: Props) {
  const { isVisible } = useFrameContext();

  const renderTooltip = (version) => {
    return <TimeAgo date={new Date(version)} />;
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
