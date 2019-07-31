/*
Renders a page that includes a public file.
*/

import { Component, Rendered, React } from "../app-framework";
import { PublicPathInfo } from "./public-path-info";
import { LinkToFile } from "./link-to-file";
import { FileContents } from "./file-contents";
import { Map } from "immutable";
import { Author } from "./types";

interface Props {
  info?: Map<string, any>;
  // If content is specified, renders the file, otherwise
  // just show a link (use "" for images, etc.)
  content?: string;
  viewer: string;
  path: string;
  why?: string;
  size: number;
  highlight: boolean;
  authors: Author[];
  base_url: string;
  views?: number;
}

export class PublicPath extends Component<Props> {
  private render_file_view(): Rendered {
    if (this.props.content != null) {
      return (
        <FileContents
          content={this.props.content}
          path={this.props.path}
          highlight={this.props.highlight}
        />
      );
    } else {
      return <LinkToFile path={this.props.path} why={this.props.why} />;
    }
  }

  public render(): Rendered {
    const view = this.render_file_view();
    if (this.props.viewer === "embed") {
      return view;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <PublicPathInfo
          path={this.props.path}
          info={this.props.info}
          authors={this.props.authors}
          base_url={this.props.base_url}
          views={this.props.views}
        />
        <div style={{ background: "white", flex: 1, margin: "10px" }}>
          {view}
        </div>
      </div>
    );
  }
}
