/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* Use this component to make an anchor tag that
   opens in a new tab in the right way, namely
   with rel=noopener.  This avoids sharing cpu
   with the main cocalc page.
*/

import { CSSProperties, ReactNode } from "react";
import { Tooltip } from "antd";

interface AProps {
  href: string;
  children: ReactNode;
  title?: string;
  placement?: string;
  style?: CSSProperties;
  onClick?: (any) => void;
  onMouseDown?: (any) => void;
}

export function A({
  href,
  children,
  style,
  title,
  placement,
  onClick,
  onMouseDown,
}: AProps) {
  if (title) {
    // use nicer antd tooltip.
    return (
      <Tooltip title={title} placement={placement as any}>
        <a
          href={href}
          target={"_blank"}
          rel={"noopener"}
          style={style}
          onClick={onClick}
          onMouseDown={onMouseDown}
        >
          {children}
        </a>
      </Tooltip>
    );
  }
  return (
    <a
      href={href}
      target={"_blank"}
      rel={"noopener"}
      style={style}
      title={title}
      onClick={onClick}
      onMouseDown={onMouseDown}
    >
      {children}
    </a>
  );
}
