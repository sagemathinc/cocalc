/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert } from "antd";
import { useState } from "react";

import { A } from "@cocalc/frontend/components/A";

export function TerminalModeDisplay({ style }) {
  const [extra, setExtra] = useState<boolean>(false);
  return (
    <Alert
      banner
      type="info"
      style={style}
      message={
        <>
          You are in <a onClick={() => setExtra(!extra)}>terminal mode</a>.
        </>
      }
      description={
        extra && (
          <>
            Terminal mode is triggered by a leading <code>/</code> in the file
            filter box. If you would like to display all folders instead, enter
            a space in front of the <code>/</code>. Terminal mode allows you to
            quickly use common Linux commands like <code>mv</code> or{" "}
            <code>cp</code> in the displayed directory without having to click
            on the file listing UI. Start{" "}
            <A href="https://www.google.com/search?q=introduction+to+command+line">
              here
            </A>{" "}
            for learning how to use the command line.
          </>
        )
      }
    />
  );
}
