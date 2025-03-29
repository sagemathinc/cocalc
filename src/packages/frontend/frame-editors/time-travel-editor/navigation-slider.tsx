/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Slider } from "antd";
import { TimeTravelActions } from "./actions";
import { TimeAgo } from "../../components";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

interface Props {
  id: string;
  actions: TimeTravelActions;
  version?: number;
  versions?;
}

export function NavigationSlider({ id, actions, version, versions }: Props) {
  const { isVisible } = useFrameContext();
  if (versions == null || version == null || !isVisible) {
    return <div />;
  }
  const renderTooltip = (index) => {
    const date = versions.get(index);
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
        actions.setVersions(id, versions.get(value));
      }}
      tooltip={{ formatter: renderTooltip, placement: "bottom" }}
    />
  );
}
