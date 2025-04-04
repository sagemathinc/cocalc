/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Tooltip } from "antd";
import { TimeAgo } from "@cocalc/frontend/components";

interface Props {
  date: Date;
  number: number;
  user?: number;
}

export function Version({ date, number, user }: Props) {
  return (
    <span>
      <Tooltip
        title={
          <>
            You are looking at <b>the exact document</b> that the author was
            editing at <TimeAgo date={date} time_ago_absolute />. Version
            numbers are unique within a given branch, and the letter code after
            the number indicates the user.
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
          Revision {number}
          {toLetterCode(user)}
        </span>
      </Tooltip>
    </span>
  );
}

interface RangeProps {
  version0: number;
  version1: number;
  user0?: number;
  user1?: number;
}

export function VersionRange({ version0, version1, user0, user1 }: RangeProps) {
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      Versions {version0}
      {toLetterCode(user0)} to {version1}
      {toLetterCode(user1)}
    </span>
  );
}

function toLetterCode(user?: number): string {
  if (user == null) {
    return "";
  }
  return String.fromCharCode(97 + (user % 26));
}
