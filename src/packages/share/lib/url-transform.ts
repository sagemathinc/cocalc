import { join } from "path";
import rawURL from "./raw-url";
import { containingPath } from "./util";

interface Options {
  id: string;
  path: string;
  relativePath: string;
}

export default function getUrlTransform({
  id,
  path,
  relativePath, // relative path of the file we are rendering.
}: Options): (href: string, tag: string) => string | undefined {
  relativePath = containingPath(relativePath);
  return (href: string, tag: string) => {
    if (tag == "a" || href.includes("://")) {
      // Don't modify anything non-local, i.e., like https://...
      // Also don't modify a tags at all.
      return;
    }
    return rawURL({ id, path, relativePath: join(relativePath, href) });
  };
}
