/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { getExtension } from "lib/util";
import {
  isAudio,
  isCodemirror,
  isImage,
  isHTML,
  isMarkdown,
  isVideo,
} from "@cocalc/frontend/file-extensions";
import rawURL from "lib/raw-url";
import { isIOS, isSafari } from "lib/feature";
import CodeMirror from "components/codemirror";
import SageWorksheet from "components/sage-worksheet";
import JupyterNotebook from "@cocalc/frontend/jupyter/nbviewer/nbviewer";
//import { Markdown } from "@cocalc/frontend/markdown";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import HTML from "@cocalc/frontend/components/html-ssr";
import A from "components/misc/A";
import getUrlTransform from "lib/url-transform";
import { FileContext } from "@cocalc/frontend/lib/file-context";

interface Props {
  id: string;
  content?: string;
  relativePath: string;
  path: string;
  truncated?: boolean;
}

export default function FileContents({
  id,
  content,
  path,
  relativePath,
}: Props): JSX.Element {
  const filename = relativePath ? relativePath : path;
  const ext = getExtension(filename);
  const raw = rawURL({ id, path, relativePath });

  const withFileContext = (x) => (
    <FileContext.Provider
      value={{ urlTransform: getUrlTransform({ id, path, relativePath }) }}
    >
      {x}
    </FileContext.Provider>
  );

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
  } else if (ext == "pdf") {
    // iOS and iPADOS does not have any way to embed PDF's in pages.
    // I think pretty much every other web browser does, though
    // strangely even desktop Safari seems often broken, so we also block that.
    // Amazingly, nextjs handles this sort of thing fine!
    return isIOS() || isSafari() ? (
      <h1 style={{ textAlign: "center", margin: "30px" }}>
        <A href={raw}>View this PDF...</A>
      </h1>
    ) : (
      <embed
        style={{ width: "100%", height: "100vh" }}
        src={raw}
        type="application/pdf"
      />
    );
  } else if (content == null) {
    return (
      <h1 style={{ textAlign: "center", margin: "30px" }}>
        <A href={raw}>Open or Download...</A>{" "}
      </h1>
    );
  } else if (isCodemirror(ext)) {
    return <CodeMirror content={content} filename={filename} />;
  } else if (isMarkdown(ext)) {
    return withFileContext(<Markdown value={content} />);
  } else if (isHTML(ext)) {
    return withFileContext(
      <HTML value={content} style={{ width: "100%", height: "100vh" }} />
    );
  } else if (ext == "sagews") {
    return withFileContext(<SageWorksheet content={content} />);
  } else if (ext == "ipynb") {
    return withFileContext(<JupyterNotebook content={content} />);
  }
  return <pre>{content}</pre>;
}
