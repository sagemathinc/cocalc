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
  versions: List<number>;
  version0: number;
  version1: number;
}

export function RangeSlider({
  id,
  actions,
  versions,
  version0,
  version1,
}: Props) {
  const { isVisible } = useFrameContext();

  // Have to hide when isVisible because tooltip stays ALWAYS visible otherwise.
  if (!isVisible || versions.size == 0) {
    // invalid input
    return <div />;
  }

  const handleChange = (values: number[]): void => {
    if (values[0] == null || values[1] == null) {
      throw Error("invalid values");
    }
    actions.setVersions(id, versions.get(values[0]), versions.get(values[1]));
  };

  const renderTooltip = (index) => {
    const d = versions.get(index);
    if (d == null) {
      // shouldn't happen
      return;
    }
    const date = new Date(d);
    if (index == version0) {
      // Workaround fact that the left label is NOT VISIBLE
      // if it is close to the right, which makes this whole
      // thing totally unusable in such cases.
      return (
        <div style={{ marginBottom: "28px" }}>
          <TimeAgo date={date} />
        </div>
      );
    }
    return <TimeAgo date={date} />;
  };

  return (
    <div
      style={{
        height: "80px",
        paddingTop: "48px",
        paddingBottom: "20px",
        width: "90%",
        margin: "10px 15px",
      }}
    >
      <Slider
        range
        min={0}
        max={versions.size - 1}
        value={[versions.indexOf(version0), versions.indexOf(version1)]}
        onChange={handleChange}
        tooltip={{ open: true, formatter: renderTooltip }}
      />
    </div>
  );
}
