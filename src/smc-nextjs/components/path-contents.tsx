/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import DirectoryListing from "components/directory-listing";
import { FileInfo, PathContents as IPathContents } from "lib/get-contents";
import Loading from "components/loading";

interface Props {
  id: string;
  isdir?: boolean;
  listing?: FileInfo[];
  content?: IPathContents;
  relativePath: string;
}

export default function PathContents({ id, isdir, listing, content, relativePath }: Props) {
  if (isdir) {
    if (listing == null) return <Loading />;
    return (
      <DirectoryListing id={id} listing={listing} relativePath={relativePath} />
    );
  }
  return <pre style={{ border: "1px solid red" }}>{content}</pre>;
}
