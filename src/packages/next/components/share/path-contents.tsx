/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import DirectoryListing from "./directory-listing";
import FileContents from "./file-contents";
import { FileInfo } from "lib/share/get-contents";
import Loading from "./loading";

interface Props {
  id: string;
  isdir?: boolean;
  listing?: FileInfo[];
  content?: string;
  relativePath: string;
  path: string;
  truncated?: string;
}

export default function PathContents({
  id,
  isdir,
  listing,
  content,
  relativePath,
  path,
  truncated,
}: Props) {
  if (isdir) {
    if (listing == null) return <Loading />;
    return (
      <>
        <Truncated truncated={truncated} />
        <DirectoryListing
          id={id}
          listing={listing}
          relativePath={relativePath}
        />
      </>
    );
  } else {
    return (
      <div
        style={{
          border: "1px solid #ccc",
          padding: "20px 15px",
        }}
      >
        <Truncated truncated={truncated} />
        <FileContents
          id={id}
          content={content}
          path={path}
          relativePath={relativePath}
        />
      </div>
    );
  }
}

const Truncated = ({ truncated }) =>
  truncated == null ? null : <h3>{truncated}</h3>;
