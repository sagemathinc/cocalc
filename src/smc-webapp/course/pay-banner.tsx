/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A banner across the top of a course that appears if the instructor is not paying in any way, so they
know they should.
*/

import { Component, React, redux } from "../app-framework";

import { Alert } from "antd";
import { CourseSettingsRecord } from "./store";
import { CourseActions } from "./actions";
import { Icon, Space } from "../r_misc";

interface PayBannerProps {
  settings: CourseSettingsRecord;
  num_students: number;
  tab: string;
  name: string;
}

export class PayBanner extends Component<PayBannerProps> {
  shouldComponentUpdate(next) {
    return (
      this.props.settings !== next.settings ||
      this.props.tab !== next.tab ||
      this.props.num_students !== next.num_students
    );
  }

  get_actions(): CourseActions {
    return redux.getActions(this.props.name);
  }

  paid() {
    if ((this.props.num_students != null ? this.props.num_students : 0) <= 3) {
      // don't bother at first
      return true;
    }
    if (this.props.settings.get("student_pay")) {
      return true;
    }
    if (this.props.settings.get("institute_pay")) {
      return true;
    }
    return false;
  }

  render() {
    let mesg, style;
    if (this.paid()) {
      return <span />;
    }

    if ((this.props.num_students != null ? this.props.num_students : 0) >= 20) {
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

    if (this.props.tab === "configuration") {
      mesg = (
        <span>
          Please select either the student pay or institute pay option below.
        </span>
      );
    } else {
      mesg = (
        <span>
          Please open the Configuration page for this course and select a pay
          option.
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
}
