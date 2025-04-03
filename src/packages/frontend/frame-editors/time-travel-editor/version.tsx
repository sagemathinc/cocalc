/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Tooltip } from "antd";
import { TimeAgo } from "@cocalc/frontend/components";

interface Props {
  date: Date;
  number: number;
  max: number;
}

export function Version({ date, number, max }: Props) {
  if (max == 0) return <span />;
  return (
    <span>
      <Tooltip
        title={
          <>
            You are looking at <b>the exact document</b> that the author was
            editing at <TimeAgo date={date} time_ago_absolute />. Version
            numbers are <b>only</b> unique within a given branch.
          </>
        }
      >
        <span
          style={{
            fontWeight: "bold",
            fontSize: "12pt",
            color: "#666",
            whiteSpace: "nowrap",
          }}
        >
          <TimeAgo date={date} />
        </span>
        ,{" "}
        <span style={{ whiteSpace: "nowrap" }}>
          Revision {number} (of {max})
        </span>
      </Tooltip>
    </span>
  );
}

interface RangeProps {
  version0: number;
  version1: number;
  max: number;
}

export function VersionRange({ version0, version1, max }: RangeProps) {
  if (max == 0) {
    return <span />;
  }
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      Versions {version0} to {version1} (of {max})
    </span>
  );
}
