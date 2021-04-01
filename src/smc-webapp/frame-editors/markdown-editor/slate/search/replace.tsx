/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Input } from "antd";
import * as React from "react";
const { useState } = React;

interface Props {}

export const Replace: React.FC<Props> = () => {
  const [replace, setReplace] = useState<string>("");
  return (
    <div style={{ display: "flex" }}>
      <Input
        placeholder="Replace..."
        value={replace}
        onChange={(e) => setReplace(e.target.value)}
        allowClear={true}
        size="small"
        style={{ border: 0, flex: 1 }}
      />
      {replace.trim() && (
        <>
          <Button size="small" onClick={() => console.log("replace one")}>
            One
          </Button>{" "}
          <Button size="small" onClick={() => console.log("replace all")}>
            All
          </Button>
        </>
      )}
    </div>
  );
};
