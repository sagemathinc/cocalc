/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import type { ButtonProps } from "antd";
import type { CSSProperties, ComponentProps, ReactNode } from "react";

import { Icon } from "./icon";

const DEFAULT_BUTTON_STYLE: CSSProperties = {
  fontSize: "14pt",
  padding: "0 5px",
} as const;

type ThreeDotIconProps = Pick<
  ComponentProps<typeof Icon>,
  "className" | "style"
>;

export function ThreeDotIcon({
  className,
  style,
}: Readonly<ThreeDotIconProps>): ReactNode {
  return <Icon className={className} name="ellipsis" rotate="90" style={style} />;
}

interface ThreeDotMenuButtonProps extends Omit<ButtonProps, "children" | "icon"> {
  open?: boolean;
}

export function ThreeDotMenuButton({
  open = false,
  style,
  type = "text",
  ...props
}: Readonly<ThreeDotMenuButtonProps>): ReactNode {
  return (
    <Button
      {...props}
      type={type}
      style={{
        ...DEFAULT_BUTTON_STYLE,
        ...(open
          ? { background: "var(--cocalc-bg-hover, #f0f0f0)" }
          : undefined),
        ...style,
      }}
      icon={<ThreeDotIcon />}
    />
  );
}
