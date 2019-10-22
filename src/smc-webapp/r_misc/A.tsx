import * as React from "react";

interface AProps {
  href: string;
  children: string;
}

export function A({ href, children }: AProps) {
  return (
    <a href={href} target={"_blank"} rel={"noopener"}>
      {children}
    </a>
  );
}
