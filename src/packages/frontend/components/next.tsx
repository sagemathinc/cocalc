/* A link to the @cocalc/next site */

import { A } from "./A";
import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

interface Props {
  href: string;
  style?;
  children?;
  query?;
}

export default function Next({ href, style, children, query }: Props) {
  if (query) {
    query = Object.entries(query)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value as any)}`
      )
      .join("&");
  }
  return (
    <A style={style} href={join(appBasePath, href) + "?" + query}>
      {children}
    </A>
  );
}
