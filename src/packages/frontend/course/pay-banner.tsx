/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
A banner across the top of a course that appears if the instructor is not paying
in any way, so they know they should.

This banner only shows up if commerical is set for hub configuration.
*/

import { CSS, useTypedRedux } from "../app-framework";
import { Alert } from "antd";
import { CourseSettingsRecord } from "./store";
import { Icon } from "../components";

interface PayBannerProps {
  settings: CourseSettingsRecord;
  num_students: number;
  show_config: () => void;
}

export function PayBanner({
  settings,
  num_students,
  show_config,
}: PayBannerProps) {
  const is_commercial = useTypedRedux("customize", "is_commercial");

  if (!is_commercial) {
    return <></>;
  }

  function paid(): boolean {
    if ((num_students != null ? num_students : 0) <= 3) {
      // don't bother at first
      return true;
    }
    if (settings.get("student_pay")) {
      return true;
    }
    if (settings.get("institute_pay")) {
      return true;
    }
    return false;
  }

  if (paid()) {
    return <span />;
  }

  let style, linkStyle: CSS;
  if ((num_students != null ? num_students : 0) >= 20) {
    // Show a harsh error.
    style = {
      background: "red",
      color: "white",
      fontSize: "16pt",
      fontWeight: "bold",
      margin: "15px",
    };
    linkStyle = { color: "white" };
  } else {
    style = {
      fontSize: "12pt",
      color: "#666",
      margin: "15px",
    };
    linkStyle = {};
  }

  return (
    <Alert
      type="warning"
      style={style}
      message={
        <div style={{ display: "flex" }}>
          <Icon name="exclamation-triangle" />
          <div style={{ flex: 1, textAlign: "center" }}>
            <a onClick={show_config} style={linkStyle}>
              Configure either the student or institute pay option...
            </a>
          </div>
          <Icon name="exclamation-triangle" />
        </div>
      }
    />
  );
}
