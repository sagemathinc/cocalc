/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Headings of the task list:

  - Custom order
  - Due
  - Changed
*/

import { Row, Col } from "../../antd-bootstrap";
import { React } from "../../app-framework";
import { Icon, Space } from "../../components";

import { HEADINGS, HEADINGS_DIR } from "./headings-info";
import { TaskActions } from "./actions";
import { Headings as ColumnHeadings, HeadingsDir, Sort } from "./types";

const NEXT_DIR = {
  asc: "desc", // since @props.dir is defined, heading is currently selected
  desc: "asc", // heading currently selected
  undefined: "asc", // this heading is not selected, so make it selected and asc
} as const;

interface HeadingProps {
  actions: TaskActions;
  heading: ColumnHeadings;
  dir?: HeadingsDir;
}

const Heading: React.FC<HeadingProps> = React.memo(
  ({ actions, heading, dir }) => {
    return (
      <a
        onClick={() => actions.set_sort_column(heading, NEXT_DIR[`${dir}`])}
        style={{ cursor: "pointer" }}
      >
        {heading}
        {dir != null && (
          <span>
            <Space />
            {dir == "asc" ? (
              <Icon name="caret-down" />
            ) : (
              <Icon name="caret-up" />
            )}
          </span>
        )}
      </a>
    );
  }
);

interface HeadingsProps {
  actions: TaskActions;
  sort: Sort;
}
export const Headings: React.FC<HeadingsProps> = React.memo(
  ({ actions, sort }) => {
    function render_heading(heading, dir) {
      return (
        <Heading actions={actions} key={heading} heading={heading} dir={dir} />
      );
    }

    function render_headings() {
      const column = sort?.get("column") ?? HEADINGS[0];
      const dir = sort?.get("dir") ?? HEADINGS_DIR[0];
      // NOTE: we use xs below so that the HEADING columns never wordwrap on
      // skinny screens, since they are really important for being
      // able to control the order.  On the other hand, if they wrap,
      // then they use a LOT of vertical space, which is at an extreme
      // premium for task lists...  See
      //   https://github.com/sagemathinc/cocalc/issues/4305
      // We hide the done column though since it overlaps and we can't
      // sort by that.
      return (
        <Row style={{ borderBottom: "1px solid lightgray", marginLeft: "8px" }}>
          <Col
            xs={1}
            style={{ color: "#666", textAlign: "center" }}
            className={"visible-sm-inline visible-md-inline visible-lg-inline"}
          >
            Done
          </Col>
          <Col xs={1} style={{ color: "#666", textAlign: "center" }}></Col>
          <Col xs={6} style={{ color: "#666" }}>
            Description
          </Col>
          <Col xs={2}>
            {render_heading(
              HEADINGS[0],
              column === HEADINGS[0] ? dir : undefined
            )}
          </Col>
          <Col xs={1}>
            {render_heading(
              HEADINGS[1],
              column === HEADINGS[1] ? dir : undefined
            )}
          </Col>
          <Col xs={1}>
            {render_heading(
              HEADINGS[2],
              column === HEADINGS[2] ? dir : undefined
            )}
          </Col>
        </Row>
      );
    }

    return <div style={{ padding: "0 10px" }}>{render_headings()}</div>;
  }
);
