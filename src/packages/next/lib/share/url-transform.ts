import { join } from "path";
import rawURL from "./raw-url";

interface Options {
  id: string;
  path: string;
  relativePath: string;
}

// NOTE: there is a similar function in frontend/project/page/url-transform.ts
export default function getUrlTransform({
  id,
  path,
  relativePath, // relative path of the directory containing the file we are rendering.
}: Options): (href: string, tag: string) => string | undefined {
  return (href: string, tag: string) => {
    if (href.startsWith("data:")) return; // never change data: urls in any way.
    if (tag == "a" || href.includes("://")) {
      // Don't modify anything non-local, i.e., like https://...
      // Also don't modify a tags at all.
      return;
    }
    return rawURL({ id, path, relativePath: join(relativePath, href) });
  };
}
