/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "@cocalc/frontend/app-framework";
import { Col, Row } from "antd";
import { Tip } from "../../components";

interface StudentHandoutInfoHeaderProps {
  title: string;
}

export const StudentHandoutInfoHeader: React.FC<
  StudentHandoutInfoHeaderProps
> = (props: StudentHandoutInfoHeaderProps) => {
  const { title } = props;

  function render_col(step_number, key, width) {
    const title = "Distribute to Student";
    const tip =
      "This column gives the status whether a handout was received by a student and lets you copy the handout to one student at a time.";
    return (
      <Col md={width} key={key}>
        <Tip title={title} tip={tip}>
          <b>
            {step_number}. {title}
          </b>
        </Tip>
      </Col>
    );
  }

  function render_headers() {
    return <Row>{render_col(1, "last_handout", 24)}</Row>;
  }

  const tip =
    title === "Handout"
      ? "This column gives the directory name of the handout."
      : "This column gives the name of the student.";

  return (
    <div>
      <Row style={{ borderBottom: "2px solid #aaa" }}>
        <Col md={4} key="title">
          <Tip title={title} tip={tip}>
            <b>{title}</b>
          </Tip>
        </Col>
        <Col md={20} key="rest">
          {render_headers()}
        </Col>
      </Row>
    </div>
  );
};
