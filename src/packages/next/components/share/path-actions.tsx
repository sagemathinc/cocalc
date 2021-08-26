import Link from "next/link";
import ExternalLink from "./external-link";
import rawURL from "lib/raw-url";
import editURL from "lib/edit-url";
import downloadURL from "lib/download-url";
import { r_join } from "@cocalc/frontend/components/r_join";
import SiteName from "./site-name";
import { useCustomize } from "lib/customize";

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
  const { dns } = useCustomize();
  const include = (action: string) => !exclude?.has(action);
  const v: JSX.Element[] = [];
  if (include("hosted")) {
    v.push(
      <Link key="hosted" href={`/public_paths/${id}`}>
        <a>
          Hosted by <SiteName />
        </a>
      </Link>
    );
  }
  if (include("edit")) {
    v.push(
      <ExternalLink key="edit" href={editURL({ id, path, dns })}>
        Edit
      </ExternalLink>
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
        href={`/public_paths/embed/${id}${
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
  return r_join(v, " | ");
}
