import Link from "next/link";
import ExternalLink from "./external-link";
import rawURL from "lib/share/raw-url";
import downloadURL from "lib/share/download-url";
import { r_join } from "@cocalc/frontend/components/r_join";
import SiteName from "./site-name";
import useCustomize from "lib/use-customize";
import Edit from "./edit";

interface Props {
  id: string;
  path: string;
  relativePath: string;
  isDir?: boolean;
  exclude?: Set<string>;
}

export default function PathActions({
  id,
  path,
  relativePath,
  isDir,
  exclude,
}: Props) {
  const include = (action: string) => !exclude?.has(action);
  const v: JSX.Element[] = [];
  if (include("hosted")) {
    v.push(
      <Link key="hosted" href={`/share/public_paths/${id}`}>
        <a>
          Hosted by <SiteName />
        </a>
      </Link>
    );
  }
  if (include("raw")) {
    v.push(
      <ExternalLink key="raw" href={rawURL({ id, path, relativePath })}>
        Raw
      </ExternalLink>
    );
  }
  if (include("embed")) {
    v.push(
      <Link
        key="embed"
        href={`/share/public_paths/embed/${id}${
          relativePath ? "/" + relativePath : ""
        }`}
      >
        <a>Embed</a>
      </Link>
    );
  }
  if (!isDir && include("download")) {
    v.push(
      <a key="download" href={downloadURL(id, path, relativePath)}>
        Download
      </a>
    );
  }
  if (include("edit")) {
    v.push(<Edit key="edit" id={id} path={path} />);
  }

  return r_join(v, " | ");
}
