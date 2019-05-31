/*
Components for rendering input and output prompts.
*/

import { React, Component } from "../app-framework";
const { Icon, TimeAgo, Tip } = require("../r_misc");

const misc = require("smc-util/misc");

const INPUT_STYLE: React.CSSProperties = {
  color: "#303F9F",
  minWidth: "14ex",
  fontFamily: "monospace",
  textAlign: "right",
  paddingRight: ".4em",
  marginRight: "3px",
  cursor: "pointer"
};

interface InputPromptProps {
  type?: string;
  state?: string;
  exec_count?: number;
  kernel?: string;
  start?: number;
  end?: number;
}

export class InputPrompt extends Component<InputPromptProps> {
  render() {
    let n;
    if (this.props.type !== "code") {
      return <div style={INPUT_STYLE} />;
    }
    const kernel = misc.capitalize(this.props.kernel != null ? this.props.kernel : "");
    let tip: string | JSX.Element = "Enter code to be evaluated.";
    switch (this.props.state) {
      case "start":
        n = <Icon name="arrow-circle-o-left" style={{ fontSize: "80%" }} />;
        tip = `Sending to be evaluated using ${kernel}.`;
        break;
      case "run":
        n = <Icon name="circle-o" style={{ fontSize: "80%" }} />;
        tip = `Waiting for another computation to finish first. Will evaluate using ${kernel}.`;
        break;
      case "busy":
        n = <Icon name="circle" style={{ fontSize: "80%", color: "#5cb85c" }} />;
        if (this.props.start != null) {
          tip = (
            <span>
              Running since <TimeAgo date={new Date(this.props.start)} /> using {kernel}.
            </span>
          );
        } else {
          tip = `Running using ${kernel}.`;
        }
        break;
      default:
        // done (or never run)
        if (this.props.exec_count) {
          n = this.props.exec_count;
          if (this.props.end != null) {
            tip = (
              <span>
                Evaluated <TimeAgo date={new Date(this.props.end)} /> using {kernel}.
              </span>
            );
          } else if (kernel) {
            tip = `Last evaluated using ${kernel}.`;
          }
        } else {
          n = " ";
        }
    }
    return (
      <div style={INPUT_STYLE} className="hidden-xs">
        <Tip title={"Code Cell"} tip={tip} placement="right">
          In [{n}]:
        </Tip>
      </div>
    );
  }
}

const OUTPUT_STYLE: React.CSSProperties = {
  color: "#D84315",
  minWidth: "14ex",
  fontFamily: "monospace",
  textAlign: "right",
  paddingRight: ".4em",
  paddingBottom: "2px"
};

interface OutputPromptProps {
  state?: string;
  exec_count?: number;
  collapsed?: boolean;
}

export class OutputPrompt extends Component<OutputPromptProps> {
  render() {
    let n;
    if (this.props.collapsed || !this.props.exec_count) {
      n = undefined;
    } else {
      n = this.props.exec_count != null ? this.props.exec_count : " ";
    }
    if (n == null) {
      return <div style={OUTPUT_STYLE} className="hidden-xs" />;
    }
    return (
      <div style={OUTPUT_STYLE} className="hidden-xs">
        Out[{n}]:
      </div>
    );
  }
}
