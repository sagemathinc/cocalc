import { ReactNode, CSSProperties } from "react";

interface Props {
  href: string;
  children?: ReactNode;
  style?: CSSProperties;
}
export default function A({ href, children, style }: Props) {
  return (
    <a
      href={href}
      target={"_blank"}
      rel={"noopener"}
      style={{ textDecoration: "none", ...style }}
    >
      {children}
    </a>
  );
}
