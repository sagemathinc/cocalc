/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Link from "next/link";
import ExternalLink from "./external-link";
import rawURL from "lib/share/raw-url";
import downloadURL from "lib/share/download-url";
import { r_join } from "@cocalc/frontend/components/r_join";
import SiteName from "./site-name";
import Edit from "./edit";

interface Props {
  id: string;
  path: string;
  url?: string;
  relativePath: string;
  isDir?: boolean;
  exclude?: Set<string>;
  project_id: string;
  image?: string;
  description?: string;
  has_site_license?: boolean;
}

export default function PathActions({
  id,
  path,
  url,
  relativePath,
  isDir,
  exclude,
  project_id,
  image,
  description,
  has_site_license,
}: Props) {
  const include = (action: string) => !exclude?.has(action);
  const v: JSX.Element[] = [];
  if (!url && include("hosted")) {
    v.push(
      <Link key="hosted" href={`/share/public_paths/${id}`}>
        Hosted by <SiteName />
      </Link>
    );
  }
  if (!url && include("embed")) {
    v.push(
      <Link
        key="embed"
        href={`/share/public_paths/embed/${id}${
          relativePath ? "/" + relativePath : ""
        }`}
      >
        Embed
      </Link>
    );
  }
  if (!url && !isDir && include("download")) {
    v.push(
      <a key="download" href={downloadURL(id, path, relativePath)}>
        Download
      </a>
    );
  }
  if (!url && include("raw")) {
    v.push(
      <ExternalLink key="raw" href={rawURL({ id, path, relativePath })}>
        Raw
      </ExternalLink>
    );
  }

  if (include("edit")) {
    if (url && isDir) {
      // TODO!
      // have to implement git clone...
    } else {
      v.push(
        <Edit
          key="edit"
          id={id}
          path={path}
          url={url}
          relativePath={relativePath}
          image={image}
          project_id={project_id}
          description={description}
          has_site_license={has_site_license}
        />
      );
    }
  }

  return <div style={{ marginTop: "5px" }}>{r_join(v, " | ")}</div>;
}
