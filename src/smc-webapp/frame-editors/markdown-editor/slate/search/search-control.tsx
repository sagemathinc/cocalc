/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Button } from "antd";
import { Icon } from "smc-webapp/r_misc";

interface Props {
  index: number;
  matches: number;
  setIndex: (number) => void;
}

export const SearchControlButtons: React.FC<Props> = ({
  index,
  matches,
  setIndex,
}) => {
  return (
    <div style={{ margin: "-1.5px -10px 0 -5px", height: "23px" }}>
      <span
        style={{ marginRight: "5px", color: matches == 0 ? "#999" : undefined }}
      >
        {matches == 0 ? 0 : index + 1} / {matches}
      </span>
      <Button
        shape="round"
        size="small"
        disabled={matches == 0}
        onClick={() => setIndex(index == 0 ? matches - 1 : index - 1)}
      >
        <Icon name="chevron-up" />
      </Button>{" "}
      <Button
        shape="round"
        size="small"
        disabled={matches == 0}
        onClick={() => setIndex(index == matches - 1 ? 0 : index + 1)}
      >
        <Icon name="chevron-down" />
      </Button>
    </div>
  );
};
