/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A banner across the top of a course that appears if the instructor is not paying
in any way, so they know they should.

This banner only shows up if commerical is set for hub configuration.
*/

import { CSS, React, useTypedRedux } from "../app-framework";

import { Alert } from "antd";
import { CourseSettingsRecord } from "./store";
import { Icon, Space } from "../r_misc";

interface PayBannerProps {
  settings: CourseSettingsRecord;
  num_students: number;
  tab: string;
  show_config: () => void;
}

export const PayBanner: React.FC<PayBannerProps> = React.memo(
  ({ settings, num_students, tab, show_config }) => {
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

    let mesg: JSX.Element, style: CSS;
    if ((num_students != null ? num_students : 0) >= 20) {
      // Show a harsh error.
      style = {
        background: "red",
        color: "white",
        fontSize: "16pt",
        fontWeight: "bold",
        margin: "5px 15px",
      };
    } else {
      style = {
        fontSize: "12pt",
        color: "#666",
        margin: "5px 15px",
      };
    }

    if (tab === "configuration") {
      mesg = (
        <span>
          Please select either the student pay or institute pay option below.
        </span>
      );
    } else {
      mesg = (
        <span>
          Please open the <a onClick={show_config}>Configuration page</a> for
          this course and select a pay option.
        </span>
      );
    }

    return (
      <Alert
        type="warning"
        style={style}
        message={
          <div>
            <Icon
              name="exclamation-triangle"
              style={{ float: "right", marginTop: "3px" }}
            />
            <Icon name="exclamation-triangle" />
            <Space />
            {mesg}
          </div>
        }
      />
    );
  }
);
