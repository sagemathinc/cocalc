/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Use this component to make an anchor tag that
   opens in a new tab in the right way, namely
   with rel=noopener.  This avoids sharing cpu
   with the main cocalc page.
*/

import React from "react";

interface AProps {
  href: string;
  children: React.ReactNode;
  title?: string;
  style?: React.CSSProperties;
  onClick?: (any) => void;
}

export function A({ href, children, style, title, onClick }: AProps) {
  return (
    <a
      href={href}
      target={"_blank"}
      rel={"noopener"}
      style={style}
      title={title}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
