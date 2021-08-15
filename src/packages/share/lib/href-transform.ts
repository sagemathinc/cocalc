import { join } from "path";
import rawURL from "./raw-url";
import { containingPath } from "./util";

interface Options {
  id: string;
  path: string;
  relativePath: string;
}

export default function getHrefTransform({
  id,
  path,
  relativePath, // relative path of the file we are rendering.
}: Options): (href: string) => string | undefined {
  relativePath = containingPath(relativePath);
  return (href: string) => {
    if (href.includes("://")) {
      // don't modify anything non-local, i.e., like https://...
      return;
    }
    return rawURL({ id, path, relativePath: join(relativePath, href) });
  };
}
