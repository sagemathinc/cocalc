/*
Show a directory listing
*/

import { encode_path } from "smc-util/misc";

import { Component, React, Rendered } from "../app-framework";

//import { PublicPathInfo } from "./public-path-info";
const { PublicPathInfo } = require("./public-path-info");

interface DirectoryListingEntry {
  name : string;
  size : number;
  mtime : number;
  isdir? : boolean;
}

interface DirectoryListingProps {
  info: Map<string, any>;
  files: DirectoryListingEntry[];
  viewer: string;
  path: string;
  hidden?: boolean; // // if true, show hidden dot files (will be controlled by a query param)
}

export class DirectoryListing extends Component<DirectoryListingProps> {
  private render_listing(): Rendered[] {
    let i = 0;
    const v: Rendered[] = [];
    for (let file of this.props.files) {
      if (!this.props.hidden && file.name[0] === ".") {
        continue;
      }
      let style;
      if (i % 2 === 0) {
        style = { background: "rgb(238, 238, 238)", padding: "5px 10px" };
      } else {
        style = { padding: "5px 10px" };
      }
      i += 1;
      v.push(
        <DirectoryListingEntry
          name={file.name}
          size={file.size}
          mtime={file.mtime}
          isdir={!!file.isdir}
          viewer={this.props.viewer}
          path={this.props.path}
          style={style}
          key={file.name}
        />
      );
    }
    return v;
  }

  public render(): Rendered {
    if (this.props.viewer === "embed") {
      return <div>{this.render_listing()}</div>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <PublicPathInfo path={this.props.path} info={this.props.info} />
        <div
          style={{ margin: "15px 30px", background: "white", overflow: "auto" }}
        >
          {this.render_listing()}
        </div>
      </div>
    );
  }
}

interface DirectoryListingEntryProps {
  name: string;
  size: number;
  mtime: number;
  isdir: boolean;
  viewer: string;
  path: string;
  style: object;
}

class DirectoryListingEntry extends Component<DirectoryListingEntryProps> {
  private get_href(): string {
    let href = this.props.name;
    href = encode_path(href);
    if (this.props.isdir) {
      href += "/";
    }
    if (this.props.viewer) {
      href += `?viewer=${this.props.viewer}`;
    }
    return href;
  }

  public render(): Rendered {
    const href: string = this.get_href();
    return (
      <a href={href} style={{ fontSize: "14px" }}>
        <div style={this.props.style} key={this.props.name}>
          {this.props.name}
          {this.props.isdir ? "/" : ""}
        </div>
      </a>
    );
  }
}
