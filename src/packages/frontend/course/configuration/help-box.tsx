/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Card } from "antd";
import { SITE_NAME, LIVE_DEMO_REQUEST } from "@cocalc/util/theme";
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
          <li>
            <A href={LIVE_DEMO_REQUEST}>
              Request a live demo <Icon name="external-link" />
            </A>{" "}
            (with a {SITE_NAME} specialist)
          </li>
          <li>
            <A href={"https://doc.cocalc.com/teaching-instructors.html"}>
              Instructor Guide for using CoCalc for teaching{" "}
              <Icon name="external-link" />
            </A>
          </li>
          <li>
            <A href="http://blog.ouseful.info/2015/11/24/course-management-and-collaborative-jupyter-notebooks-via-sagemathcloud/">
              Course management and collaborative Jupyter Notebooks{" "}
              (2015, but still relevant) <Icon name="external-link" /> 
            </A>
          </li>
        </ul>
      </span>
    </Card>
  );
}
