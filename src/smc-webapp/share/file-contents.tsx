/*
Render the contents of a file.   This is typically used
for smaller files for which we can reasonably do this.
A lot of sophisticated code in CoCalc's main smc-webapp
library is used under the hood to implement this.
*/

import { fromJS } from "immutable";

import { filename_extension, path_split } from "smc-util/misc2";

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

export function has_viewer(ext: string): boolean {
  return (
    has_special_viewer(ext) ||
    extensions.image.has(ext) ||
    extensions.video.has(ext) ||
    extensions.pdf.has(ext) ||
    extensions.audio.has(ext)
  );
}

// Has a special viewer -- not the sort of file that could
// just be embedded via html (e.g., NOT an image).
export function has_special_viewer(ext: string): boolean {
  return (
    ext === "md" ||
    ext === "ipynb" ||
    ext === "sagews" ||
    extensions.codemirror[ext] ||
    extensions.html.has(ext)
  );
}

// Is the actual content used in rendering files with the given extension.
export function needs_content(ext: string): boolean {
  return !(
    extensions.image[ext] ||
    extensions.pdf[ext] ||
    extensions.video[ext]
  );
}

interface Props {
  content: string; // ignored for some file types, e.g., image, pdf, video
  path: string;
  highlight: boolean;
}

export class FileContents extends Component<Props> {
  private render_link(): Rendered {
    const filename = path_split(this.props.path).tail;
    const href = filename + "?viewer=download";
    return <a href={href}>Download...</a>;
  }

  public render(): Rendered {
    let elt;
    const { path } = this.props;
    const ext = filename_extension(path).toLowerCase();
    const src = path_split(path).tail + "?viewer=raw";

    if (extensions.image.has(ext)) {
      elt = <img src={src} />;
    } else if (extensions.pdf.has(ext)) {
      elt = <PDF src={src} />;
    } else if (extensions.video.has(ext)) {
      const video_style = { maxWidth: "100%", height: "auto" };
      elt = (
        <video
          controls={true}
          autoPlay={true}
          loop={true}
          style={video_style}
          src={src}
        />
      );
    } else if (extensions.audio.has(ext)) {
      elt = <audio src={src} autoPlay={true} controls={true} loop={false} />;
    } else if (ext === "md" && this.props.highlight) {
      // WARNING: slow if big!
      elt = <Markdown value={this.props.content} />;
    } else if (extensions.html.has(ext)) {
      if (this.props.highlight) {
        elt = <HTML value={this.props.content} />;
      } else {
        // Fast, and we don't do any sanitization anyways.
        elt = (
          <div>
            (File too big to render with math typesetting.)
            <br />
            <div dangerouslySetInnerHTML={{ __html: this.props.content }} />;
          </div>
        );
      }
    } else if (ext === "ipynb" && this.props.highlight) {
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
    } else if (ext === "sagews" && this.props.highlight) {
      elt = (
        <Worksheet
          sagews={parse_sagews(this.props.content)}
          style={{ margin: "30px" }}
        />
      );
    } else if (extensions.codemirror[ext] && this.props.highlight) {
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
      const x = <pre>{this.props.content}</pre>;
      if (this.props.highlight) {
        elt = x;
      } else {
        elt = (
          <div>
            (File too big to render nicely. {this.render_link()})
            <br />
            <br />
            {x}
          </div>
        );
      }
    }

    return <Redux>{elt}</Redux>;
  }
}
