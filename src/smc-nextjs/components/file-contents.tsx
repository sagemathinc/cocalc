/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { getExtension } from "lib/util";
import { isImage } from "lib/file-extensions";
import rawURL from "lib/raw-url";

interface Props {
  id: string;
  content?: string;
  relativePath: string;
  path: string;
  basePath?: string;
}

export default function FileContents({
  id,
  content,
  path,
  relativePath,
  basePath,
}: Props): JSX.Element {
  const filename = relativePath ? relativePath : path;
  const ext = getExtension(filename);
  if (isImage(ext)) {
    return (
      <div>
        <img
          src={rawURL(id, filename, basePath)}
          style={{ maxWidth: "100%" }}
        />
      </div>
    );
  }
  return (
    <div>
      <pre>{content}</pre>
    </div>
  );
}
