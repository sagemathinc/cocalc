/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";

interface Props {
  Search: JSX.Element;
  isCurrent?: boolean;
}

const HEIGHT = "25px";

export const EditBar: React.FC<Props> = ({ isCurrent, Search }) => {
  return (
    <div style={{ borderBottom: "1px solid lightgray", height: HEIGHT }}>
      {isCurrent && <div style={{ float: "right" }}>{Search}</div>}
    </div>
  );
};
