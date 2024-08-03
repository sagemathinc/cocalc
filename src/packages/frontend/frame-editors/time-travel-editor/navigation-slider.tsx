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
  versions;
  max: number;
}

export function NavigationSlider({
  id,
  actions,
  version,
  versions,
  max,
}: Props) {
  const { isVisible } = useFrameContext();
  if (version == null || !isVisible) {
    return <div />;
  }
  const renderTooltip = (index) => {
    const date = versions.get(index);
    if (date == null) return; // shouldn't happen
    return <TimeAgo date={date} />;
  };

  return (
    <Slider
      min={0}
      max={max}
      value={version}
      onChange={(value) => {
        actions.set_version(id, value);
      }}
      tooltip={{ formatter: renderTooltip, placement: "bottom", open: true }}
    />
  );
}
