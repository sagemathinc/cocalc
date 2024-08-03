/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Range slider to select two versions in order to see the diff between them.

Uses https://github.com/tajo/react-range
*/

import { List } from "immutable";
import { TimeTravelActions } from "./actions";
import { TimeAgo } from "../../components";
import { Slider } from "antd";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

interface Props {
  id: string;
  actions: TimeTravelActions;
  versions: List<Date>;
  version0?: number;
  version1?: number;
  max: number;
}

export function RangeSlider({
  id,
  actions,
  versions,
  version0,
  version1,
  max,
}: Props) {
  const { isVisible } = useFrameContext();

  const handleChange = (values: number[]): void => {
    if (values[0] == null || values[1] == null) {
      throw Error("invalid values");
    }
    actions.set_versions(id, values[0], values[1]);
  };

  const renderTooltip = (index) => {
    const date = versions.get(index);
    if (date == null) return; // shouldn't happen
    return <TimeAgo date={date} />;
  };

  // Have to hide when isVisible because tooltip stays ALWAYS visible otherwise!
  if (
    !isVisible ||
    version0 == null ||
    version1 == null ||
    max < 0 ||
    version0 < 0 ||
    version1 > max
  ) {
    return <div />;
  }
  return (
    <div
      style={{
        height: "80px",
        paddingTop: "48px",
        paddingBottom: "20px",
        width: "90%",
        margin: "auto",
      }}
    >
      <Slider
        range
        min={0}
        max={max}
        value={[version0, version1]}
        onChange={handleChange}
        tooltip={{ open: true, formatter: renderTooltip }}
      />
    </div>
  );
}
