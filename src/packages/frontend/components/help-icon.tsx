/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Display a ? "help" icon, which -- when clicked -- shows a help tip
*/

import { Button, Popover } from "antd";
import type { TooltipPlacement } from "antd/es/tooltip";
import { CSSProperties, useState } from "react";

// ATTN: do not import @cocalc/app-framework or components, because this is also used in next!
import { COLORS } from "@cocalc/util/theme";
import { Icon } from "./icon";

interface Props {
  title: string;
  children: React.ReactNode;
  maxWidth?: string; // default is 50vw
  style?: CSSProperties;
  extra?: string;
  placement?: TooltipPlacement;
}

export const HelpIcon: React.FC<Props> = ({
  style,
  title,
  children,
  maxWidth = "50vw",
  extra = "",
  placement,
}: Props) => {
  const [open, setOpen] = useState<boolean>(false);

  const textStyle: CSSProperties = {
    color: COLORS.BS_BLUE_TEXT,
    cursor: "pointer",
    ...style,
  } as const;

  return (
    <Popover
      placement={placement}
      content={
        <div onClick={(e) => e.stopPropagation()} style={{ maxWidth }}>
          {children}
        </div>
      }
      title={
        <div onClick={(e) => e.stopPropagation()}>
          {title}
          <Button
            type="text"
            style={{ float: "right", fontWeight: "bold" }}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          >
            <Icon name="times" />
          </Button>
        </div>
      }
      trigger="click"
      open={open}
      onOpenChange={setOpen}
    >
      <span style={textStyle}>
        {extra ? <>{extra} </> : undefined}
        <Icon style={textStyle} name="question-circle" />
      </span>
    </Popover>
  );
};
