/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Range slider to select two versions in order to see the diff between them.

Uses https://github.com/tajo/react-range
*/

import { List } from "immutable";
import { TimeAgo } from "../../components";
import { Slider } from "antd";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { type ReactNode, useMemo } from "react";

interface Props {
  versions?: List<number>;
  version0?: number;
  version1?: number;
  setVersion0: (number) => void;
  setVersion1: (number) => void;
}

export function RangeSlider({
  versions,
  version0,
  version1,
  setVersion0,
  setVersion1,
}: Props) {
  const { isVisible } = useFrameContext();

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

  // Have to hide when isVisible because tooltip stays ALWAYS visible otherwise.
  if (
    !isVisible ||
    versions == null ||
    versions.size == 0 ||
    version0 == null ||
    version1 == null
  ) {
    // invalid input
    return <div />;
  }

  const handleChange = (values: number[]): void => {
    if (values[0] == null || values[1] == null) {
      throw Error("invalid values");
    }
    setVersion0(values[0]);
    setVersion1(values[1]);
  };

  const renderTooltip = (version) => {
    const date = new Date(version);
    if (version == version0) {
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
        marks={marks}
        step={null}
        included={false}
        range
        min={versions.get(0)}
        max={versions.get(-1)}
        value={[version0, version1]}
        onChange={handleChange}
        tooltip={{ open: true, formatter: renderTooltip }}
      />
    </div>
  );
}
