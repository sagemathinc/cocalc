/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import Link from "next/link";
import downloadURL from "lib/share/download-url";
import { r_join } from "@cocalc/frontend/components/r_join";
import SiteName from "./site-name";
import Edit from "./edit";

import type { JSX } from "react";

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
}: Props) {
  const include = (action: string) => !exclude?.has(action);
  const v: JSX.Element[] = [];
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
        />,
      );
    }
  }
  if (!url && include("hosted")) {
    v.push(
      <Link
        key="hosted"
        href={`/share/public_paths/${id}`}
        style={{ marginTop: "5px" }}
      >
        Hosted by <SiteName />
      </Link>,
    );
  }
  if (!url && !isDir && include("download")) {
    v.push(
      <a
        key="download"
        href={downloadURL(id, path, relativePath)}
        style={{ marginTop: "5px" }}
      >
        <Icon name="cloud-download" /> Download
      </a>,
    );
  }

  return <div>{r_join(v, <div style={{ width: "10px" }} />)}</div>;
}
