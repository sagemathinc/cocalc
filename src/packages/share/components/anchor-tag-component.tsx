import Link from "next/link";
import { join } from "path";
import A from "components/misc/A";

interface Options {
  id: string;
  relativePath: string;
}

export default function getAnchorTagComponent({ id, relativePath }: Options) {
  return function AnchorTagComponent({ href, title, children }) {
    if (href.includes("://")) {
      return (
        <A href={href} title={title}>
          {children}
        </A>
      );
    } else {
      return (
        <Link
          href={`/public_paths/${id}/${encodeURIComponent(
            join(relativePath, href)
          )}`}
        >
          <a title={title}>{children}</a>
        </Link>
      );
    }
  };
}
