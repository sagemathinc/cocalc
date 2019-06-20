/*
This is...
*/

import { fromJS, Map } from "immutable";

import {
  filename_extension,
  human_readable_size,
  path_split
} from "smc-util/misc2";

import { Component, Rendered, React, Redux, redux } from "../app-framework";

const { HTML, Markdown } = require("../r_misc");

import * as file_editors from "../file-editors";

// Register the Jupyter editor, so we can use it to render public ipynb
import { register } from "../jupyter/nbviewer/register";
register();

import { PDF } from "./pdf";

import * as extensions from "./extensions";

import { CodeMirrorStatic } from "../jupyter/codemirror-static";

//import { Worksheet as Worksheet } from "../sagews/worksheet";
const { Worksheet } = require("../sagews/worksheet");
//import { parse_sagews } from "../sagews/parse-sagews";
const { parse_sagews } = require("../sagews/parse-sagews");

import { PublicPathInfo } from "./public-path-info";

export function has_viewer(ext: string): boolean {
  return (
    extensions.pdf.has(ext) ||
    ext === "md" ||
    extensions.html.has(ext) ||
    ext === "ipynb" ||
    ext === "sagews" ||
    extensions.codemirror[ext]
  );
}

interface Props {
  info?: Map<string, any>;
  content?: string;
  viewer: string;
  path: string;
  size?: number;
  max_size?: number;
}

export class PublicPath extends Component<Props> {
  private render_too_big(): Rendered {
    return (
      <div style={{ margin: "30px", color: "#333" }}>
        <h3>File too big to display</h3>
        <br />
        {human_readable_size(this.props.size)} is bigger than{" "}
        {human_readable_size(this.props.max_size)}
        <br />
        <br />
        You can download this file using the Raw link above.
      </div>
    );
  }

  private render_main_view(): Rendered {
    let elt;
    const { path } = this.props;
    const ext = filename_extension(path).toLowerCase();
    const src = path_split(path).tail;

    if (extensions.image.has(ext)) {
      return <img src={src} />;
    } else if (extensions.pdf.has(ext)) {
      return <PDF src={src} />;
    } else if (extensions.video.has(ext)) {
      const video_style = { maxWidth: "100%", height: "auto" };
      return (
        <video
          controls={true}
          autoPlay={true}
          loop={true}
          style={video_style}
          src={src}
        />
      );
    } else if (extensions.audio.has(ext)) {
      return <audio src={src} autoPlay={true} controls={true} loop={false} />;
    }

    if (this.props.content == null) {
      // This happens if the file is too big
      elt = this.render_too_big();
    } else if (has_viewer(ext)) {
      if (ext === "md") {
        elt = (
          <Markdown
            value={this.props.content}
            style={{ margin: "10px", display: "block" }}
          />
        );
      } else if (extensions.html.has(ext)) {
        elt = (
          <HTML
            value={this.props.content}
            style={{ margin: "10px", display: "block" }}
          />
        );
      } else if (ext === "ipynb") {
        const name = file_editors.initialize(
          path,
          redux,
          undefined,
          true,
          this.props.content
        );
        const Viewer = file_editors.generate(path, redux, undefined, true);
        elt = <Viewer name={name} />;
        const f = () => file_editors.remove(path, redux, undefined, true);
        // TODO: should really happen after render; however, don't know how yet... so just wait a bit and do it.
        // This is critical to do; otherwise, when the ipynb is updated, we'll see the old version.
        setTimeout(f, 10000);
      } else if (ext === "sagews") {
        elt = (
          <Worksheet
            sagews={parse_sagews(this.props.content)}
            style={{ margin: "30px" }}
          />
        );
      } else if (extensions.codemirror[ext]) {
        const options = fromJS(extensions.codemirror[ext]);
        //options = options.set('lineNumbers', true)
        elt = (
          <CodeMirrorStatic
            value={this.props.content}
            options={options}
            style={{ background: "white", margin: "10px 20px" }}
          />
        );
      } else {
        // should not happen
        elt = <pre>{this.props.content}</pre>;
      }
    } else {
      elt = <pre>{this.props.content}</pre>;
    }

    return <Redux>{elt}</Redux>;
  }

  public render(): Rendered {
    if (this.props.viewer === "embed") {
      return this.render_main_view();
    } else {
      return (
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <PublicPathInfo path={this.props.path} info={this.props.info} />
          <div style={{ background: "white", flex: 1 }}>
            {this.render_main_view()}
          </div>
        </div>
      );
    }
  }
}
