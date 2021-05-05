/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Rendering output part of a Sage worksheet cell
*/

import * as React from "react";

import { encode_path, filename_extension, keys, cmp, len } from "smc-util/misc";
import { FLAGS } from "smc-util/sagews";
import { Stdout } from "smc-webapp/jupyter/output-messages/stdout";
import { Stderr } from "smc-webapp/jupyter/output-messages/stderr";
import { HTML, Markdown } from "smc-webapp/r_misc";
import { fromJS } from "immutable";
import CodeMirrorStatic from "smc-webapp/codemirror/static";
import * as extensions from "smc-webapp/share/extensions";
import { OutputMessage, OutputMessages } from "./parse-sagews";

interface Props {
  output: OutputMessages;
  flags?: string;
}

export function CellOutput({ output, flags }: Props) {
  // @ts-ignore -- since not *explicitly* used
  function render_auto(): JSX.Element {
    // This is deprecated, but can be in some older worksheets.
    // It should do nothing for static rendering.
    return <span />;
  }

  // @ts-ignore -- since not *explicitly* used
  function render_stdout(value: string, key: string): JSX.Element {
    return <Stdout key={key} message={fromJS({ text: value })} />;
  }

  // @ts-ignore -- since not *explicitly* used
  function render_stderr(value: string, key: string): JSX.Element {
    return <Stderr key={key} message={fromJS({ text: value })} />;
  }

  // @ts-ignore -- since not *explicitly* used
  function render_md(value: string, key: string): JSX.Element {
    return <Markdown key={key} value={value} />;
  }

  // @ts-ignore -- since not *explicitly* used
  function render_html(value: string, key: string): JSX.Element {
    return <HTML key={key} value={value} auto_render_math={true} />;
  }

  // @ts-ignore -- since not *explicitly* used
  function render_interact(_value: object, key: string): JSX.Element {
    return <div key={key}>Interact: please open in CoCalc</div>;
  }

  // @ts-ignore -- since not *explicitly* used
  function render_d3(_value: object, key): JSX.Element {
    return <div key={key}>d3-based renderer not yet implemented</div>;
  }

  // @ts-ignore -- since not *explicitly* used
  function render_file(
    value: {
      show?: boolean;
      url?: string;
      filename: string;
      text?: string;
      uuid?: string;
    },
    key: string
  ): JSX.Element | undefined {
    if (value.show != null && !value.show) {
      return;
    }

    let src: string;
    if (value.url != null) {
      src = value.url;
    } else {
      src = `${
        (window as any).app_base_url != null ? (window as any).app_base_url : ""
      }/blobs/${encode_path(value.filename)}?uuid=${value.uuid}`;
    }
    const ext = filename_extension(value.filename).toLowerCase();
    if (extensions.image.has(ext)) {
      return <img key={key} src={src} />;
    } else if (extensions.video.has(ext)) {
      return <video key={key} src={src} controls loop />;
    } else if (extensions.audio.has(ext)) {
      return <audio src={src} autoPlay={true} controls loop />;
    } else if (ext === "sage3d") {
      return render_3d(value.filename, key);
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
  }

  function render_3d(_filename: string, key: string): JSX.Element {
    return <div key={key}>3D rendering not yet implemented</div>;
  }

  // @ts-ignore -- since not *explicitly* used
  function render_code(
    value: { mode: string; source?: string },
    key: string
  ): JSX.Element {
    const options = fromJS({ mode: { name: value.mode } });
    return (
      <CodeMirrorStatic
        key={key}
        value={value.source != null ? value.source : ""}
        options={options}
        style={{ background: "white", padding: "10px" }}
      />
    );
  }

  // @ts-ignore -- since not *explicitly* used
  function render_tex(
    value: { tex: string; display?: boolean },
    key: string
  ): JSX.Element {
    let html = `$${value.tex}$`;
    if (value.display) {
      html = `$${html}$`;
    }
    return (
      <div key={key}>
        <HTML value={html} auto_render_math={true} />
      </div>
    );
  }

  // @ts-ignore -- since not *explicitly* used
  function render_raw_input(
    val: { prompt: string; value: string | undefined },
    key
  ): JSX.Element {
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
  }

  // @ts-ignore -- since not *explicitly* used
  function render_output_mesg(elts: JSX.Element[], mesg: object): void {
    for (const type in mesg) {
      let value: any = mesg[type];
      let f = eval(`render_${type}`);
      if (f == null) {
        f = render_stderr;
        value = `unknown message type '${type}'`;
      }
      elts.push(f(value, elts.length));
    }
  }

  function render_output(): JSX.Element[] {
    const elts: JSX.Element[] = [];
    for (const mesg of processMessages(output)) {
      render_output_mesg(elts, mesg);
    }
    return elts;
  }

  if (flags != null && flags.indexOf(FLAGS.hide_output) != -1) {
    return <span />;
  }
  return <div style={{ margin: "15px" }}>{render_output()}</div>;
}

// sort in order to a list and combine adjacent stdout/stderr messages.
const STRIP = ["done", "error", "once", "javascript", "hide", "show"]; // these are just deleted -- make no sense for static rendering.

function processMessages(output: OutputMessages): object[] {
  const v: string[] = keys(output);
  v.sort((a, b) => cmp(parseInt(a), parseInt(b)));
  let r: OutputMessage[] = [];
  for (const a of v) {
    const m = output[a];
    for (const s of STRIP) {
      if (m[s] != null) {
        delete m[s];
      }
    }
    const n = len(m);
    if (n === 0) {
      continue;
    }
    if (m.clear) {
      r = [];
      continue;
    }
    if (m.delete_last) {
      r.pop();
      continue;
    }
    if (r.length > 0 && n === 1) {
      if (m.stdout != null && r[r.length - 1].stdout != null) {
        r[r.length - 1] = { stdout: r[r.length - 1].stdout + m.stdout };
        continue;
      }
      if (m.stderr != null && r[r.length - 1].stderr != null) {
        r[r.length - 1] = { stderr: r[r.length - 1].stderr + m.stderr };
        continue;
      }
    }
    r.push(m);
  }
  return r;
}
