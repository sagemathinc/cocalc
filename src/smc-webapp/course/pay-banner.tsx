/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
A banner across the top of a course that appears if the instructor is not paying in any way, so they
know they should.
*/

import { React, rclass, rtypes } from "../app-framework";

import { Alert } from "react-bootstrap";
import { Icon, Space } from "../r_misc";

export let PayBanner = rclass({
  propTypes: {
    settings: rtypes.immutable.Map.isRequired,
    num_students: rtypes.number,
    tab: rtypes.string,
    name: rtypes.string
  },

  shouldComponentUpdate(next) {
    return (
      this.props.settings !== next.settings ||
      this.props.tab !== next.tab ||
      this.props.num_students !== next.num_students
    );
  },

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
  },

  show_configuration() {
    return __guard__(this.actions(this.props.name), x =>
      x.set_tab("configuration")
    );
  },

  render() {
    let link, mesg, style;
    if (this.paid()) {
      return <span />;
    }

    if ((this.props.num_students != null ? this.props.num_students : 0) >= 20) {
      // Show a harsh error.
      style = {
        background: "red",
        color: "white",
        fontSize: "16pt",
        fontWeight: "bold"
      };
      link = { color: "navajowhite" };
    } else {
      style = {
        fontSize: "12pt",
        color: "#666"
      };
      link = {};
    }

    if (this.props.tab === "settings") {
      mesg = (
        <span>
          Please select either the student pay or institute pay option below.
        </span>
      );
    } else {
      mesg = (
        <span>
          Please open the course{" "}
          <a onClick={this.show_configuration} style={link}>
            Configuration tab of this course
          </a>{" "}
          and select a pay option.
        </span>
      );
    }

    return (
      <Alert bsStyle="warning" style={style}>
        <Icon
          name="exclamation-triangle"
          style={{ float: "right", marginTop: "3px" }}
        />
        <Icon name="exclamation-triangle" />
        <Space />
        {mesg}
      </Alert>
    );
  }
});

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
