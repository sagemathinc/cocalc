/*
Share server top-level landing page.
*/

import { List, Map } from "immutable";
import { Component, React, Rendered } from "../app-framework";
import { encode_path } from "smc-util/misc";
const { TimeAgoElement } = require("../r_misc");
import { Space } from "../r_misc/space";

const INDEX_STYLE = {
  margin: "0px 30px 15px 30px",
  background: "white"
};

interface Props {
  public_paths: Map<string, any>;
  paths_order: List<string>;
  page_number: number;
  page_size: number;
  path_prefix?: string;
}

export class PublicPathsBrowser extends Component<Props> {
  private render_overview(): Rendered {
    return (
      <span
        style={{
          color: "#333",
          paddingRight: "10px",
          borderRight: "1px solid black",
          marginRight: "10px"
        }}
      >
        Page {this.props.page_number} of{" "}
        {Math.ceil(this.props.paths_order.size / this.props.page_size)}.
      </span>
    );
  }

  private render_prev_page(): Rendered {
    if (this.props.page_number > 1) {
      return (
        <a
          href={`?page=${this.props.page_number - 1}`}
          style={{ textDecoration: "none" }}
        >
          Previous
        </a>
      );
    } else {
      return <span style={{ color: "#666" }}>Previous</span>;
    }
  }

  private render_next_page(): Rendered {
    if (
      this.props.page_number * this.props.page_size <
      this.props.public_paths.size
    ) {
      return (
        <a
          href={`?page=${this.props.page_number + 1}`}
          style={{ textDecoration: "none" }}
        >
          Next
        </a>
      );
    } else {
      return <span style={{ color: "#666" }}>Next</span>;
    }
  }

  private render_description(info): Rendered {
    return (
      <span key="desc" style={{ display: "inline-block", width: "40%" }}>
        {info.get("description")}
      </span>
    );
  }

  private render_path(info): Rendered {
    return (
      <span key="path" style={{ display: "inline-block", width: "30%" }}>
        {info.get("path")}
      </span>
    );
  }

  private render_last_edited(info): Rendered {
    const last_edited = info.get("last_edited");
    return (
      <span key="last" style={{ display: "inline-block", width: "30%" }}>
        {last_edited != null ? (
          <TimeAgoElement date={last_edited} live={false} />
        ) : (
          undefined
        )}
      </span>
    );
  }

  private render_headings(): Rendered {
    return (
      <div
        key="headings"
        style={{
          fontWeight: "bold",
          padding: "5px",
          margin: "0px 30px",
          fontSize: "12pt",
          color: "#666",
          borderBottom: "1px solid lightgrey"
        }}
      >
        <span key="path" style={{ display: "inline-block", width: "30%" }}>
          Path
        </span>
        <span key="desc" style={{ display: "inline-block", width: "40%" }}>
          Description
        </span>
        <span key="last" style={{ display: "inline-block", width: "30%" }}>
          Last Edited
        </span>
      </div>
    );
  }

  private render_public_path_link(info, bgcolor): Rendered {
    const id = info.get("id");
    const info_path = encode_path(info.get("path"));
    const href = `${
      this.props.path_prefix ? this.props.path_prefix : ""
    }${id}/${info_path}?viewer=share`;

    return (
      <div key={id} style={{ padding: "5px 10px", background: bgcolor }}>
        <a href={href} style={{ display: "inline-block", width: "100%" }}>
          {this.render_path(info)}
          {this.render_description(info)}
          {this.render_last_edited(info)}
        </a>
        <br />
      </div>
    );
  }

  private render_index(): Rendered[] {
    let j = 0;
    const result: Rendered[] = [];
    for (
      let i = this.props.page_size * (this.props.page_number - 1);
      i < this.props.page_size * this.props.page_number;
      i++
    ) {
      var bgcolor;
      const id = this.props.paths_order.get(i);
      if (id == null) {
        continue;
      }
      const info = this.props.public_paths.get(id);
      if (info == null || info.get("auth")) {
        // TODO: as in router.tsx, we skip all public_paths with auth info for now,
        // until auth is implemented... (?)
        continue;
      }
      if (info.get("unlisted")) {
        // Do NOT list unlisted public paths.
        continue;
      }
      if (j % 2 === 0) {
        bgcolor = "rgb(238, 238, 238)";
      } else {
        bgcolor = undefined;
      }
      j += 1;
      result.push(this.render_public_path_link(info, bgcolor));
    }
    return result;
  }

  private render_page_info(): Rendered {
    if (
      this.props.page_number === 1 &&
      this.props.page_size > this.props.paths_order.size
    )
      return; // no need to paginate.
    return (
      <div key="top" style={{ paddingLeft: "30px", background: "#efefef" }}>
        {this.render_overview()}
        <Space />
        {this.render_prev_page()}
        <Space />
        {this.render_next_page()}
      </div>
    );
  }

  public render(): Rendered {
    return (
      <div>
        {this.render_page_info()}
        {this.render_headings()}
        <div key="index" style={INDEX_STYLE}>
          {this.render_index()}
        </div>
      </div>
    );
  }
}
