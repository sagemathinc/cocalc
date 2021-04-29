/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { getExtension } from "lib/util";
import { isImage } from "lib/file-extensions";

interface Props {
  id: string;
  content?: string;
  path: string;
}

export default function FileContents({
  id,
  content,
  path,
}: Props): JSX.Element {
  const ext = getExtension(path);
  if (isImage(ext)) {
    return (
      <img src="https://cocalc.com/107dcdce-4222-41a7-88a1-7652e29c1159/port/54145/8d304d73-6544-47e2-993b-6060fae84763/raw/issue-5212/a.png" />
    );
  }
  return (
    <div>
      {id}/{path}
      <br />
      <pre>{content}</pre>
    </div>
  );
}
