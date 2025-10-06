/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { Icon, Gap, VisibleMDLG } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import { Col, Row } from "antd";

interface Props {
  active_file_sort: { column_name: string; is_descending: boolean };
  sort_by: (heading: string) => void;
}

const row_style: React.CSSProperties = {
  cursor: "pointer",
  color: COLORS.GRAY_M,
  backgroundColor: "#fafafa",
  border: "1px solid #eee",
  borderRadius: "4px",
} as const;

const inner_icon_style = { marginRight: "10px" };

export function ListingHeader({ active_file_sort, sort_by }: Props) {
  function render_sort_link(
    column_name: string,
    display_name: string | React.JSX.Element,
    marginLeft?,
  ) {
    return (
      <span>
        <VisibleMDLG>
          <span style={{ marginLeft }} />
        </VisibleMDLG>
        <a
          href=""
          onClick={(e) => {
            e.preventDefault();
            return sort_by(column_name);
          }}
          style={{
            color: COLORS.FG_BLUE,
            fontWeight: "bold",
            whiteSpace: "nowrap",
          }}
        >
          {display_name}
          <Gap />
          {active_file_sort.column_name === column_name ? (
            <Icon
              style={inner_icon_style}
              name={active_file_sort.is_descending ? "caret-up" : "caret-down"}
            />
          ) : undefined}
        </a>
      </span>
    );
  }

  return (
    <Row style={row_style}>
      <Col sm={4} xs={6} />
      <Col sm={2} xs={6}>
        {render_sort_link("type", "Type", "-4px")}
      </Col>
      <Col sm={1} xs={6} style={{ textAlign: "center" }}>
        {render_sort_link(
          "starred",
          <Icon
            name="star-filled"
            style={{ color: COLORS.FG_BLUE, fontSize: "12pt" }}
          />,
          "0px",
        )}
      </Col>
      <Col sm={10} xs={24}>
        {render_sort_link("name", "Name", "-4px")}
      </Col>
      <Col sm={7} xs={12}>
        {render_sort_link("time", "Date Modified", "2px")}
        <span className="pull-right">
          {render_sort_link("size", "Size/Download/View")}
        </span>
      </Col>
    </Row>
  );
}
