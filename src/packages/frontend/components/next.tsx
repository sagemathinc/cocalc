/* A link to the @cocalc/next site */

import { A } from "./A";
import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

interface Props {
  href: string;
  style?;
  children?;
}

export default function Next({ href, style, children }: Props) {
  return (
    <A style={style} href={join(appBasePath, href)}>
      {children}
    </A>
  );
}
