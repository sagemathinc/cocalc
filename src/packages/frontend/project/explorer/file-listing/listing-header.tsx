/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { TypedMap } from "@cocalc/frontend/app-framework";
import { Icon, Space } from "@cocalc/frontend/components";
const { Row, Col } = require("react-bootstrap");

// TODO: Flatten active_file_sort for easy PureComponent use
interface Props {
  active_file_sort: TypedMap<{ column_name: string; is_descending: boolean }>;
  sort_by: (heading: string) => void;
}

const row_style: React.CSSProperties = {
  cursor: "pointer",
  color: "#666",
  backgroundColor: "#fafafa",
  border: "1px solid #eee",
  borderRadius: "4px",
} as const;

const inner_icon_style = { marginRight: "10px" };

// TODO: Something should uniformly describe how sorted table headers work.
// 5/8/2017 We have 3 right now, Course students, assignments panel and this one.
export const ListingHeader: React.FC<Props> = (props: Props) => {
  const { active_file_sort, sort_by } = props;

  function render_sort_link(column_name: string, display_name: string) {
    return (
      <a
        href=""
        onClick={(e) => {
          e.preventDefault();
          return sort_by(column_name);
        }}
      >
        {display_name}
        <Space />
        {active_file_sort.get("column_name") === column_name ? (
          <Icon
            style={inner_icon_style}
            name={
              active_file_sort.get("is_descending") ? "caret-up" : "caret-down"
            }
          />
        ) : undefined}
      </a>
    );
  }

  return (
    <Row style={row_style}>
      <Col sm={2} xs={3} />
      <Col sm={1} xs={3}>
        {render_sort_link("type", "Type")}
      </Col>
      <Col sm={4} smPush={5} xs={6}>
        {render_sort_link("time", "Date Modified")}
        <span className="pull-right">
          {render_sort_link("size", "Size/Download/View")}
        </span>
      </Col>
      <Col sm={5} smPull={4} xs={12}>
        {render_sort_link("name", "Name")}
      </Col>
    </Row>
  );
};
