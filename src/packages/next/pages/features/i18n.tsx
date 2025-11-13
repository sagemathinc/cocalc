/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Space } from "antd";
import { useState } from "react";

// NOTE: do not import components as a whole, just pick the exact file
import { TestI18N } from "@cocalc/frontend/components/test-i18n";

import Head from "components/landing/head";

export default function I18N() {
  const [num, setNum] = useState<number>(0);

  return (
    <div style={{ margin: "20px" }}>
      <Head title={"CoCalc I18N"} />
      <h1>CoCalc I18N</h1>
      <div>This is a test:</div>
      <TestI18N num={num} />
      <Space.Compact>
        <Button onClick={() => setNum(num + 1)}>Up</Button>
        <Button onClick={() => setNum(num - 1)}>Down</Button>
      </Space.Compact>
    </div>
  );
}
