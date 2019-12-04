/*
We use so little of react-bootstrap in CoCalc that for a first quick round
of switching to antd, I'm going to see if it isn't easy to re-implement
much of the same functionality on top of antd.

Obviously, this is meant to be temporary, since it is far better if our
code consistently uses the antd api explicitly.  However, there are
some serious problems / bug /issues with using our stupid old react-bootstrap
*at all*, hence this.
*/

// What we haven't converted yet, but do use in CoCalc:
export {
  Checkbox,
  FormControl,
  FormGroup,
  Form,
  Well,
  InputGroup,
  Row,
  Col
} from "react-bootstrap";

import { React } from "./app-framework";
import { r_join, Space } from "./r_misc";

import * as antd from "antd";

// Note regarding buttons -- there are 6 semantics meanings in bootstrap, but
// only four in antd, and it we can't automatically collapse them down in a meaningful
// way without fundamentally removing information and breaking our UI (e.g., buttons
// change look after an assignment is sent successfully in a course).
const BS_STYLE_TO_TYPE = {
  primary: "primary",
  success: "default", // antd doesn't have this so we do it via style below.
  info: "dashed",
  warning: "default", // antd doesn't have this so we do it via style below.
  danger: "danger",
  link: "link"
};

export function Button(props: any) {
  const type = props.bsStyle ? BS_STYLE_TO_TYPE[props.bsStyle] : undefined;
  let style: undefined | React.CSSProperties = props.style;
  if (props.bsStyle === "warning") {
    // antd has no analogue of "warning", it's not clear to me what it should be so for
    // now just copy the style.
    if (style == null) {
      style = {};
    }
    style.backgroundColor = "#f0ad4e";
    style.borderColor = "#eea236";
    style.color = "#ffffff";
  } else if (props.bsStyle === "success") {
    // antd has no analogue of "success", it's not clear to me what it should be so for
    // now just copy the style.
    if (style == null) {
      style = {};
    }
    style.backgroundColor = "#5cb85c";
    style.borderColor = "#4cae4c";
    style.color = "#ffffff";
  }

  // The span is needed inside below, otherwise icons and labels get squashed together
  // due to button having word-spacing 0.
  return (
    <antd.Button
      onClick={props.onClick}
      type={type}
      disabled={props.disabled}
      style={style}
    >
      <span>{props.children}</span>
    </antd.Button>
  );
}

export function ButtonGroup(props: any) {
  return (
    <antd.Button.Group style={props.style}>{props.children}</antd.Button.Group>
  );
}

export function ButtonToolbar(props: any) {
  return <div style={props.style}>{r_join(props.children, <Space />)}</div>;
}

export function Grid(props: any) {
  return <div>{props.children}</div>;
}
