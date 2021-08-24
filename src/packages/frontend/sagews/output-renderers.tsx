import React from "react";
import { join } from "path";
import { encode_path, filename_extension } from "@cocalc/util/misc";
import { isImage, isVideo, isAudio } from "@cocalc/frontend/file-extensions";
import { fromJS } from "immutable";
import { Stdout } from "@cocalc/frontend/jupyter/output-messages/stdout";
import { Stderr } from "@cocalc/frontend/jupyter/output-messages/stderr";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import HTML from "@cocalc/frontend/components/html-ssr";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

const RENDERERS = {
  auto: () => <span />,

  md: (value: string, key: string) => <Markdown key={key} value={value} />,

  html: (value: string, key: string) => <HTML key={key} value={value} />,

  stdout: (value: string, key: string) => (
    <Stdout key={key} message={fromJS({ text: value })} />
  ),

  stderr: (value: string, key: string) => (
    <Stderr key={key} message={fromJS({ text: value })} />
  ),

  interact: (_value: object, key: string) => (
    <div key={key}>Interact: please open in CoCalc</div>
  ),

  d3: (_value: object, key) => (
    <div key={key}>d3-based renderer not yet implemented</div>
  ),

  file: (
    value: {
      show?: boolean;
      url?: string;
      filename: string;
      text?: string;
      uuid?: string;
    },
    key: string
  ) => {
    if (value.show != null && !value.show) {
      return;
    }

    let src: string;
    if (value.url != null) {
      src = value.url;
    } else {
      src = join(
        appBasePath,
        `blobs/${encode_path(value.filename)}?uuid=${value.uuid}`
      );
    }
    const ext = filename_extension(value.filename).toLowerCase();
    if (isImage(ext)) {
      return <img key={key} src={src} />;
    } else if (isVideo(ext)) {
      return <video key={key} src={src} controls loop />;
    } else if (isAudio(ext)) {
      return <audio src={src} autoPlay={true} controls loop />;
    } else if (ext === "sage3d") {
      return RENDERERS["3d"](value.filename, key);
    } else {
      let text: string;
      if (value.text) {
        ({ text } = value);
      } else {
        text = value.filename;
      }
      return (
        <a key={key} href={src} target="_blank">
          {text}
        </a>
      );
    }
  },

  "3d": (_filename: string, key: string) => (
    <div key={key}>3D rendering not yet implemented</div>
  ),

  code: (value: { mode: string; source?: string }, key: string) => (
    <CodeMirrorStatic
      key={key}
      value={value.source != null ? value.source : ""}
      options={{ mode: { name: value.mode } }}
      style={{ background: "white", padding: "10px" }}
    />
  ),

  tex: (value: { tex: string; display?: boolean }, key: string) => {
    let html = `$${value.tex}$`;
    if (value.display) {
      html = `$${html}$`;
    }
    return <HTML key={key} value={html} />;
  },

  raw_input: ({ prompt, value }: { prompt: string; value?: string }, key) => {
    value = value ?? "";
    return (
      <div key={key}>
        <b>{prompt}</b>
        <input
          style={{ padding: "0em 0.25em", margin: "0em 0.25em" }}
          type="text"
          size={Math.max(47, value.length + 10)}
          readOnly={true}
          value={value}
        />
      </div>
    );
  },
};

export default RENDERERS;
