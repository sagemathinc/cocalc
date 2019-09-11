import * as React from "react";

import { Icon, Space } from "../../../r_misc";
const { Row, Col } = require("react-bootstrap");

// TODO: Flatten active_file_sort for easy PureComponent use
interface Props {
  active_file_sort: { column_name: string; is_descending: boolean };
  sort_by: (heading: string) => void;
}

const row_style: React.CSSProperties = {
  cursor: "pointer",
  color: "#666",
  backgroundColor: "#fafafa",
  border: "1px solid #eee",
  borderRadius: "4px"
};

const inner_icon_style = { marginright: "10px" };

// TODO: Something should uniformly describe how sorted table headers work.
// 5/8/2017 We have 3 right now, Course students, assignments panel and this one.
export class ListingHeader extends React.Component<Props> {
  render_sort_link(column_name: string, display_name: string) {
    return (
      <a
        href=""
        onClick={e => {
          e.preventDefault();
          return this.props.sort_by(column_name);
        }}
      >
        {display_name}
        <Space />
        {this.props.active_file_sort.column_name === column_name ? (
          <Icon
            style={inner_icon_style}
            name={
              this.props.active_file_sort.is_descending
                ? "caret-up"
                : "caret-down"
            }
          />
        ) : (
          undefined
        )}
      </a>
    );
  }

  render() {
    return (
      <Row style={row_style}>
        <Col sm={2} xs={3} />
        <Col sm={1} xs={3}>
          {this.render_sort_link("type", "Type")}
        </Col>
        <Col sm={4} smPush={5} xs={6}>
          {this.render_sort_link("time", "Date Modified")}
          <span className="pull-right">
            {this.render_sort_link("size", "Size")}
          </span>
        </Col>
        <Col sm={5} smPull={4} xs={12}>
          {this.render_sort_link("name", "Name")}
        </Col>
      </Row>
    );
  }
}
