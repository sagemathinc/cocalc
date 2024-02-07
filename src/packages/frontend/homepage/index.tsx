/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col } from "@cocalc/frontend/antd-bootstrap";
import { Paragraph, Title } from "@cocalc/frontend/components";
import { Footer } from "@cocalc/frontend/customize";

export function Homepage() {
  function renderHome() {
    return (
      <div className="smc-vfill">
        <Title level={1}>Hello</Title>
        <Paragraph>
          Welcome to CoCalc! This is a web-based collaborative computation
          platform that allows you to run SageMath, Python, R, and other
          software in a web browser. You can use it to do homework, research,
          and more. You can also use CoCalc to teach classes and to work on
          projects with other people.
        </Paragraph>
      </div>
    );
  }

  return (
    <div className={"smc-vfill"}>
      <Col
        sm={12}
        md={12}
        lg={10}
        lgOffset={1}
        className={"smc-vfill"}
        style={{ overflowY: "auto", marginTop: "10px" }}
      >
        {renderHome()}
        <Footer />
      </Col>
    </div>
  );
}
