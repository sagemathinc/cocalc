/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Range slider to select two versions in order to see the diff between them.

Uses https://github.com/tajo/react-range
*/

import { List } from "immutable";
import { Slider } from "antd";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { type ReactNode, useMemo } from "react";
type VersionValue = string | number;

interface Props {
  versions?: List<VersionValue>;
  version0?: VersionValue;
  version1?: VersionValue;
  setVersion0: (v: VersionValue) => void;
  setVersion1: (v: VersionValue) => void;
}

export function RangeSlider({ marks, ...props }: Props & { marks?: boolean }) {
  if (marks) {
    return <RangeSliderMarks {...props} />;
  } else {
    return <RangeSliderNoMarks {...props} />;
  }
}

function RangeSliderNoMarks({
  versions,
  version0,
  version1,
  setVersion0,
  setVersion1,
}: Props) {
  const { isVisible } = useFrameContext();

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
    const v0 = versions.get(values[0]);
    const v1 = versions.get(values[1]);
    if (v0 != null) setVersion0(v0);
    if (v1 != null) setVersion1(v1);
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
        tooltip={{ open: false }}
        range
        min={0}
        max={versions.size - 1}
        value={[versions.indexOf(version0), versions.indexOf(version1)]}
        onChange={handleChange}
      />
    </div>
  );
}

// This lays the marks out with dots spread by when they actually happened, like
// a timeline.  It is sometimes very nice and sometimes very annoying.
// TODO: show optionally via a "timeline" toggle.

function RangeSliderMarks({
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
    versions.forEach((_, idx) => {
      marks[idx] = <span />;
    });
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
    const v0 = versions.get(values[0]);
    const v1 = versions.get(values[1]);
    if (v0 != null) setVersion0(v0);
    if (v1 != null) setVersion1(v1);
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
        tooltip={{ open: false }}
        marks={marks}
        step={null}
        included={false}
        range
        min={0}
        max={versions.size - 1}
        value={[
          versions.indexOf(version0!),
          versions.indexOf(version1!),
        ]}
        onChange={handleChange}
      />
    </div>
  );
}
