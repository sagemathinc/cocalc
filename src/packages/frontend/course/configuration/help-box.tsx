/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Card } from "antd";
import { LIVE_DEMO_REQUEST } from "@cocalc/util/theme";
import { Icon, A } from "@cocalc/frontend/components";

export function HelpBox() {
  return (
    <Card
      title={
        <>
          <Icon name="question-circle" /> Help
        </>
      }
    >
      <span style={{ color: "#666", fontSize: "11pt" }}>
        <ul>
          <li style={{ marginBottom: "10px" }}>
            <A href={"https://doc.cocalc.com/teaching-instructors.html"}>
              <Icon name="graduation-cap" /> Instructor Guide
            </A>
          </li>
          <li>
            <A href={LIVE_DEMO_REQUEST}>
              <Icon name="slides" /> Request a live demo
            </A>{" "}
          </li>
        </ul>
      </span>
    </Card>
  );
}
