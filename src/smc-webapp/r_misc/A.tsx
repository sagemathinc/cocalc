/* Use this component to make an anchor tag that
   opens in a new tab in the right way, namely
   with rel=noopener.  This avoids sharing cpu
   with the main cocalc page.
*/

import * as React from "react";

interface AProps {
  href: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function A({ href, children, style }: AProps) {
  return (
    <a href={href} target={"_blank"} rel={"noopener"} style={style}>
      {children}
    </a>
  );
}
