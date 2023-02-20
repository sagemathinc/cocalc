/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Display a ? "help" icon, which -- when clicked -- shows a help tip
*/

import { Button, Popover } from "antd";

import { React, useState } from "@cocalc/frontend/app-framework";
import { Icon } from "./icon";
import { COLORS } from "@cocalc/util/theme";

interface Props {
  title: string;
  children: React.ReactNode;
  maxWidth?: string; // default is 50vw
}

export const HelpIcon: React.FC<Props> = (props: Props) => {
  const { title, children, maxWidth = "50vw" } = props;

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
            Close
          </Button>
        </>
      }
      trigger="click"
      open={open}
      onOpenChange={setOpen}
    >
      <Icon
        style={{ color: COLORS.BS_BLUE_TEXT, cursor: "pointer" }}
        name="question-circle"
      />
    </Popover>
  );
};
