/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Navigation Buttons to:

 - first
 - move a step forward
 - move a step back
 - last
*/

import { Button, Space } from "antd";
import { Icon } from "@cocalc/frontend/components";
import type { List } from "immutable";
type VersionValue = string | number;

interface Props {
  version?: VersionValue;
  setVersion: (v: VersionValue) => void;
  version0?: VersionValue;
  setVersion0: (v: VersionValue) => void;
  version1?: VersionValue;
  setVersion1: (v: VersionValue) => void;
  versions?: List<VersionValue>;
  changesMode: boolean;
}

export function NavigationButtons({
  changesMode,
  versions,
  version,
  setVersion,
  version0,
  setVersion0,
  version1,
  setVersion1,
}: Props) {
  if (versions == null || versions?.size == 0) {
    return null;
  }
  if (changesMode && (version0 == null || version1 == null)) {
    return null;
  }
  if (!changesMode && version == null) {
    return null;
  }

  const step = (button: "first" | "prev" | "next" | "last") => {
    if (changesMode) {
      if (version0 == null || version1 == null) {
        return;
      }
      let i0 = versions.indexOf(version0);
      if (i0 == -1) {
        return;
      }
      let i1 = versions.indexOf(version1);
      if (i1 == -1) {
        return;
      }
      const setVersions = (v0, v1) => {
        setVersion0(v0);
        setVersion1(v1);
      };
      if (button == "first") {
        const a = versions.get(0);
        const b = versions.get(i1 - i0);
        if (a != null && b != null) setVersions(a, b);
      } else if (button == "last") {
        const a = versions.get(i0 - i1 - 1);
        const b = versions.get(-1);
        if (a != null && b != null) setVersions(a, b);
      } else if (button == "next") {
        const a = versions.get(i0 + 1);
        const b = versions.get(i1 + 1);
        if (a != null && b != null) setVersions(a, b);
      } else if (button == "prev") {
        const a = versions.get(i0 - 1);
        const b = versions.get(i1 - 1);
        if (a != null && b != null) setVersions(a, b);
      }
    } else {
      let i: number = -1;
      if (button == "first") {
        i = 0;
      } else if (button == "last") {
        i = versions.size - 1;
      } else if (button == "prev") {
        if (version == null) return;
        i = versions.indexOf(version) - 1;
      } else if (button == "next") {
        if (version == null) return;
        i = versions.indexOf(version) + 1;
      }
      if (i < 0) {
        i = 0;
      } else if (i >= versions.size) {
        i = versions.size - 1;
      }
      const newVersion = versions.get(i);
      if (newVersion != null) {
        setVersion(newVersion);
      }
    }
  };

  let v0, v1;
  if (changesMode) {
    v0 = version0;
    v1 = version1;
  } else {
    v0 = v1 = version;
  }

  return (
    <Space.Compact style={{ display: "inline-flex" }}>
      <Button
        title={"First version"}
        onClick={() => step("first")}
        disabled={v0 == null || v0 <= versions.get(0)!}
      >
        <Icon name="backward" />
      </Button>
      <Button
        title={"Previous version"}
        onClick={() => step("prev")}
        disabled={v0 == null || v0 <= versions.get(0)!}
      >
        <Icon name="step-backward" />
      </Button>
      <Button
        title={"Next version"}
        onClick={() => step("next")}
        disabled={v1 == null || v1 >= versions.get(-1)!}
      >
        <Icon name="step-forward" />
      </Button>
      <Button
        title={"Most recent version"}
        onClick={() => step("last")}
        disabled={v1 == null || v1 >= versions.get(-1)!}
      >
        <Icon name="forward" />
      </Button>
    </Space.Compact>
  );
}
