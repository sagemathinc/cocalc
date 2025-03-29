/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Slider } from "antd";
import { TimeAgo } from "../../components";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

interface Props {
  versions?;
  version?: number;
  setVersion: (number) => void;
}

export function NavigationSlider({ version, versions, setVersion }: Props) {
  const { isVisible } = useFrameContext();
  if (versions == null || version == null || !isVisible) {
    return null;
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
        setVersion(versions.get(value));
      }}
      tooltip={{ formatter: renderTooltip, placement: "bottom" }}
    />
  );
}
