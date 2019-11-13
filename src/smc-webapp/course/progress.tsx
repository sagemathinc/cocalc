/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Progress indicator for assigning/collecting/etc. a particular assignment or handout.
*/

import { React, Component } from "../app-framework";
const { Icon, Space } = require("../r_misc");

const { COLORS } = require("smc-util/theme");

const misc = require("smc-util/misc");

const progress_info = {
  color: COLORS.GRAY_D,
  marginLeft: "10px",
  whiteSpace: "normal"
};

const progress_info_done = misc.copy(progress_info);
progress_info_done.color = COLORS.BS_GREEN_DD;

interface ProgressProps {
  done: number;
  not_done: number;
  step: string;
  skipped?: boolean;
}

export class Progress extends Component<ProgressProps> {
  render_checkbox() {
    if (this.props.not_done === 0) {
      return (
        <span style={{ fontSize: "12pt" }}>
          <Icon name="check-circle" />
          <Space />
        </span>
      );
    }
  }

  render_status() {
    if (!this.props.skipped) {
      return (
        <>
          ({this.props.done} / {this.props.not_done + this.props.done}{" "}
          {this.props.step})
        </>
      );
    } else {
      return <>Skipped</>;
    }
  }

  render() {
    let style;
    if (
      this.props.done == null ||
      this.props.not_done == null ||
      this.props.step == null
    ) {
      return <span />;
    }
    if (this.props.not_done === 0) {
      style = progress_info_done;
    } else {
      style = progress_info;
    }
    return (
      <div style={style}>
        {this.render_checkbox()}
        {this.render_status()}
      </div>
    );
  }
}
