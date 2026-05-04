/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Popover } from "antd";
import type { ReactNode } from "react";

import { Icon } from "@cocalc/frontend/components";

interface RunAllPopoverProps {
  id: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  type: "primary" | "default";
  content: ReactNode | (() => ReactNode);
  ariaLabel: string;
}

export function RunAllPopover({
  id,
  open,
  onOpenChange,
  type,
  content,
  ariaLabel,
}: RunAllPopoverProps) {
  return (
    <Popover
      key={id}
      placement="bottom"
      trigger="click"
      destroyOnHidden
      open={open}
      onOpenChange={onOpenChange}
      content={content}
      overlayInnerStyle={{ maxWidth: 545 }}
    >
      <span style={{ display: "inline-block" }}>
        <Button
          type={type}
          size="small"
          icon={<Icon name="forward" />}
          aria-label={ariaLabel}
        />
      </span>
    </Popover>
  );
}
