/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { FileInfo } from "lib/share/get-contents";
import DirectoryListing from "./directory-listing";
import FileContents from "./file-contents";
import Loading from "./loading";

interface Props {
  id: string;
  isdir?: boolean;
  listing?: FileInfo[];
  content?: string;
  relativePath: string;
  path: string;
  truncated?: string;
  jupyter_api?: boolean;
}

export default function PathContents({
  id,
  isdir,
  listing,
  content,
  relativePath,
  path,
  truncated,
  jupyter_api,
}: Props) {
  if (isdir) {
    if (listing == null) return <Loading style={{ fontSize: "30px" }} />;
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
          padding: "20px 0",
        }}
      >
        <Truncated truncated={truncated} />
        <FileContents
          id={id}
          content={content}
          path={path}
          relativePath={relativePath}
          jupyter_api={jupyter_api}
        />
      </div>
    );
  }
}

const Truncated = ({ truncated }) =>
  truncated == null ? null : <h3>{truncated}</h3>;
