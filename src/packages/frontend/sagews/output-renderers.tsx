import React from "react";
import { join } from "path";
import { encode_path, filename_extension } from "@cocalc/util/misc";
import { image, video, audio } from "@cocalc/frontend/share/extensions";
import { fromJS } from "immutable";
import { Stdout } from "@cocalc/frontend/jupyter/output-messages/stdout";
import { Stderr } from "@cocalc/frontend/jupyter/output-messages/stderr";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import { Markdown } from "@cocalc/frontend/markdown";
//import { HTML } from "@cocalc/frontend/r_misc/html";

const RENDERERS = {
  md: (value: string, key: string) => <Markdown key={key} value={value} />,
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
        window.app_base_path,
        `blobs/${encode_path(value.filename)}?uuid=${value.uuid}`
      );
    }
    const ext = filename_extension(value.filename).toLowerCase();
    if (image.has(ext)) {
      return <img key={key} src={src} />;
    } else if (video.has(ext)) {
      return <video key={key} src={src} controls loop />;
    } else if (audio.has(ext)) {
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
};

/*
import { join } from "path";
import { encode_path, filename_extension } from "@cocalc/util/misc";
import { image, video, audio } from "@cocalc/frontend/share/extensions";
import { Stdout } from "@cocalc/frontend/jupyter/output-messages/stdout";
import { Stderr } from "@cocalc/frontend/jupyter/output-messages/stderr";
import { HTML } from "@cocalc/frontend/r_misc/html";
import { Markdown } from "@cocalc/frontend/r_misc/markdown";
import { fromJS } from "immutable";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";

const RENDERERS = {
  auto: () => <span />,

  stdout: (value: string, key: string) => (
    <Stdout key={key} message={fromJS({ text: value })} />
  ),

  stderr: (value: string, key: string) => (
    <Stderr key={key} message={fromJS({ text: value })} />
  ),

  md: (value: string, key: string) => <Markdown key={key} value={value} />,

  html: (value: string, key: string) => (
    <HTML key={key} value={value} auto_render_math={true} />
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
        window.app_base_path,
        `blobs/${encode_path(value.filename)}?uuid=${value.uuid}`
      );
    }
    const ext = filename_extension(value.filename).toLowerCase();
    if (image.has(ext)) {
      return <img key={key} src={src} />;
    } else if (video.has(ext)) {
      return <video key={key} src={src} controls loop />;
    } else if (audio.has(ext)) {
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
    return (
      <div key={key}>
        <HTML value={html} auto_render_math={true} />
      </div>
    );
  },

  raw_input: (val: { prompt: string; value: string | undefined }, key) => {
    const { prompt, value } = val;
    // sanitizing value, b/c we know the share server throws right here:
    // TypeError: Cannot read property 'length' of undefined
    const value_sani = value ?? "";
    return (
      <div key={key}>
        <b>{prompt}</b>
        <input
          style={{ padding: "0em 0.25em", margin: "0em 0.25em" }}
          type="text"
          size={Math.max(47, value_sani.length + 10)}
          readOnly={true}
          value={value_sani}
        />
      </div>
    );
  },
};
*/

export default RENDERERS;
