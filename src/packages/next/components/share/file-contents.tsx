/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import {
  isAudio,
  isCodemirror,
  isHTML,
  isImage,
  isMarkdown,
  isVideo,
} from "@cocalc/frontend/file-extensions";
import Slides from "@cocalc/frontend/frame-editors/slides-editor/share";
import Whiteboard from "@cocalc/frontend/frame-editors/whiteboard-editor/share/index";
import JupyterNotebook from "@cocalc/frontend/jupyter/nbviewer/nbviewer";
import { FileContext } from "@cocalc/frontend/lib/file-context";
import A from "components/misc/A";
import { isIOS, isSafari } from "lib/share/feature";
import rawURL from "lib/share/raw-url";
import getUrlTransform from "lib/share/url-transform";
import { containingPath, getExtension } from "lib/share/util";
import getAnchorTagComponent from "./anchor-tag-component";
import CodeMirror from "./codemirror";
import SageWorksheet from "./sage-worksheet";

import type { JSX } from "react";

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

  const withFileContext = (x) => {
    const relPath = containingPath(relativePath);
    const value = {
      urlTransform: getUrlTransform({ id, path, relativePath: relPath }),
      AnchorTagComponent: getAnchorTagComponent({ id, relativePath: relPath }),
      noSanitize: false, // We **MUST** sanitize, since we users could launch XSS attacks, mess up style, etc.,
      // This will, of course, break things, in which case users will have to open them in their own projects.
    };
    return <FileContext.Provider value={value}>{x}</FileContext.Provider>;
  };

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
  } else if (ext === "pdf") {
    // iOS and iPADOS does not have any way to embed PDF's in pages.
    // I think pretty much every other web browser does, though
    // strangely even desktop Safari seems often broken, so we also block that.
    // Amazingly, nextjs handles this sort of thing fine!
    return isIOS() || isSafari() ? (
      <h1 style={{ textAlign: "center", margin: "30px" }}>
        <A href={raw} external>
          View this PDF...
        </A>
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
        <A href={raw} external>
          Open or Download...
        </A>{" "}
      </h1>
    );
  } else if (isCodemirror(ext)) {
    return <CodeMirror content={content} filename={filename} />;
  } else if (isMarkdown(ext)) {
    return withFileContext(<Markdown value={content} />);
  } else if (isHTML(ext)) {
    // We use a sandboxed iframe since it is much more likely to be
    // useful to users than our HTML component.  Most use of our
    // HTML component with math rendering, etc., is much better done
    // via a Markdown file.  This makes it easy to show, e.g.,
    // static k3d plots, which CUP is doing.  HTML files tend to
    // be independent of cocalc anyways.
    return (
      <iframe
        srcDoc={content}
        style={{ width: "100%", height: "100vh" }}
        sandbox="allow-scripts"
      />
    );
    //     return withFileContext(
    //       <HTML value={content} style={{ width: "100%", height: "100vh" }} />
    //     );
  } else if (ext == "sagews") {
    return withFileContext(<SageWorksheet content={content} />);
  } else if (ext == "ipynb") {
    return withFileContext(<JupyterNotebook content={content} />);
  } else if (ext == "board") {
    return withFileContext(<Whiteboard content={content} />);
  } else if (ext == "slides") {
    return withFileContext(<Slides content={content} />);
  }
  return <pre>{content}</pre>;
}
