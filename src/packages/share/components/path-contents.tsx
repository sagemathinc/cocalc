/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import DirectoryListing from "components/directory-listing";
import FileContents from "components/file-contents";
import { FileInfo } from "lib/get-contents";
import Loading from "components/loading";

interface Props {
  id: string;
  isdir?: boolean;
  listing?: FileInfo[];
  content?: string;
  relativePath: string;
  basePath: string;
  path: string;
}

export default function PathContents({
  id,
  isdir,
  listing,
  content,
  relativePath,
  basePath,
  path,
}: Props) {
  if (isdir) {
    if (listing == null) return <Loading />;
    return (
      <DirectoryListing id={id} listing={listing} relativePath={relativePath} />
    );
  } else {
    return (
      <FileContents
        id={id}
        content={content}
        path={path}
        relativePath={relativePath}
        basePath={basePath}
      />
    );
  }
}
