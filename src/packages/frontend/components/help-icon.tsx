/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Display a ? "help" icon, which -- when clicked -- shows a help tip
*/

import { Button, Popover } from "antd";

import { CSSProperties } from "react";
import { React, useState } from "@cocalc/frontend/app-framework";
import { Icon } from "./icon";
import { COLORS } from "@cocalc/util/theme";

interface Props {
  title: string;
  children: React.ReactNode;
  maxWidth?: string; // default is 50vw
  style?: CSSProperties;
}

export const HelpIcon: React.FC<Props> = ({
  style,
  title,
  children,
  maxWidth = "50vw",
}: Props) => {
  const [open, setOpen] = useState<boolean>(false);

  return (
    <Popover
      content={<div style={{ maxWidth }}>{children}</div>}
      title={
        <>
          {title}
          <Button
            type="text"
            style={{ float: "right", fontWeight: "bold" }}
            onClick={() => setOpen(false)}
          >
            <Icon name="times" />
          </Button>
        </>
      }
      trigger="click"
      open={open}
      onOpenChange={setOpen}
    >
      <Icon
        style={{ color: COLORS.BS_BLUE_TEXT, cursor: "pointer", ...style }}
        name="question-circle"
      />
    </Popover>
  );
};
