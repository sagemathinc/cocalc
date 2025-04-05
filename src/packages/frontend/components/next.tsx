/* A link to the @cocalc/next site */

import { A } from "./A";
import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

interface Props {
  href: string;
  style?;
  children?;
  query?;
  sameTab?: boolean;
}

export default function Next({ href, style, children, query, sameTab }: Props) {
  if (query) {
    query = Object.entries(query)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value as any)}`,
      )
      .join("&");
  }
  const href0 = `${join(appBasePath, href)}${query ? "?" + query : ""}`;
  if (sameTab) {
    return (
      <a style={style} href={href0}>
        {children}
      </a>
    );
  }
  return (
    <A style={style} href={href0}>
      {children}
    </A>
  );
}
