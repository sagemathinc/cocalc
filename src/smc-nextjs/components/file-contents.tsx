/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { getExtension } from "lib/util";
import {
  isAudio,
  isCodemirror,
  isImage,
  isMarkdown,
  isVideo,
} from "lib/file-extensions";
import rawURL from "lib/raw-url";
import CodeMirror from "components/codemirror";
import Markdown from "components/markdown";

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
  const raw = rawURL(id, filename, basePath);
  if (isImage(ext)) {
    return <img src={raw} style={{ maxWidth: "100%" }} />;
  } else if (isVideo(ext)) {
    return (
      <video
        controls={true}
        autoPlay={true}
        loop={true}
        style={{ width: "100%", height: "auto" }}
        src={raw}
      />
    );
  } else if (isAudio(ext)) {
    return <audio src={raw} autoPlay={true} controls={true} loop={false} />;
  } else if (isCodemirror(ext) && content != null) {
    return <CodeMirror content={content} filename={filename} />;
  } else if (isMarkdown(ext) && content != null) {
    return <Markdown content={content} />;
  }
  return <pre>{content}</pre>;
}
