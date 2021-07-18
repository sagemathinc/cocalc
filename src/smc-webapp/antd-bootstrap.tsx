/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
We use so little of react-bootstrap in CoCalc that for a first quick round
of switching to antd, I'm going to see if it isn't easy to re-implement
much of the same functionality on top of antd

Obviously, this is meant to be temporary, since it is far better if our
code consistently uses the antd api explicitly.  However, there are
some serious problems / bug /issues with using our stupid old react-bootstrap
*at all*, hence this.
*/

// TODO: What we haven't converted yet, but do use in CoCalc:
export {
  FormControl,
  FormGroup,
  Form,
  InputGroup,
  Navbar,
  Nav,
  NavItem,
  Table,
} from "react-bootstrap";

import { React, Rendered } from "./app-framework";
import { r_join, Space } from "./r_misc";

// Workaround a webpack (or typescript) bug and also
// avoid importing all of antd (just what we need).
import * as antd from "antd";

// Note regarding buttons -- there are 6 semantics meanings in bootstrap, but
// only four in antd, and it we can't automatically collapse them down in a meaningful
// way without fundamentally removing information and breaking our UI (e.g., buttons
// change look after an assignment is sent successfully in a course).
export type ButtonStyle =
  | "primary"
  | "success"
  | "default"
  | "info"
  | "warning"
  | "danger"
  | "link";

const BS_STYLE_TO_TYPE: {
  [name in ButtonStyle]: "primary" | "default" | "dashed" | "danger" | "link";
} = {
  primary: "primary",
  success: "default", // antd doesn't have this so we do it via style below.
  default: "default",
  info: "default", // antd doesn't have this so we do it via style below.
  warning: "default", // antd doesn't have this so we do it via style below.
  danger: "danger",
  link: "link",
};

export type ButtonSize = "large" | "small" | "xsmall";

function parse_bsStyle(props: {
  bsStyle?: ButtonStyle;
  style?: React.CSSProperties;
  disabled?: boolean;
}): {
  type: "primary" | "default" | "dashed" | "link";
  style: React.CSSProperties;
  danger?: boolean;
  ghost?: boolean;
  disabled?: boolean;
  loading?: boolean;
} {
  let type =
    props.bsStyle == null
      ? "default"
      : BS_STYLE_TO_TYPE[props.bsStyle] ?? "default";

  let style: React.CSSProperties | undefined = undefined;
  // antd has no analogue of "success" & "warning", it's not clear to me what
  // it should be so for now just copy the style from react-bootstrap.
  if (props.bsStyle === "warning") {
    // antd has no analogue of "warning", it's not clear to me what
    // it should be so for
    // now just copy the style.
    style = {
      backgroundColor: "#f0ad4e",
      borderColor: "#eea236",
      color: "#ffffff",
    };
  } else if (props.bsStyle === "success") {
    style = {
      backgroundColor: "#5cb85c",
      borderColor: "#4cae4c",
      color: "#ffffff",
    };
  } else if (props.bsStyle == "info") {
    style = {
      backgroundColor: "rgb(91, 192, 222)",
      borderColor: "rgb(70, 184, 218)",
      color: "#ffffff",
    };
  }
  if (props.disabled && style != null) {
    style.opacity = 0.65;
  }

  style = { ...style, ...props.style };
  let danger: boolean | undefined = undefined;
  let loading: boolean | undefined = undefined; // nothing mapped to this yet
  let ghost: boolean | undefined = undefined; // nothing mapped to this yet
  if (type == "danger") {
    type = "default";
    danger = true;
  }
  return { type, style, danger, ghost, loading };
}

export const Button = (props: {
  bsStyle?: ButtonStyle;
  bsSize?: ButtonSize;
  style?: React.CSSProperties;
  disabled?: boolean;
  onClick?: (e?: any) => void;
  key?: string;
  children?: any;
  className?: string;
  href?: string;
  target?: string;
  title?: string;
  tabIndex?: number;
  active?: boolean;
  id?: string;
}) => {
  // The span is needed inside below, otherwise icons and labels get squashed together
  // due to button having word-spacing 0.
  const { type, style, danger, ghost, loading } = parse_bsStyle(props);
  let size: "middle" | "large" | "small" | undefined = undefined;
  if (props.bsSize == "large") {
    size = "large";
  } else if (props.bsSize == "small") {
    size = "middle";
  } else if (props.bsSize == "xsmall") {
    size = "small";
  }
  if (props.active) {
    style.backgroundColor = "#d4d4d4";
    style.boxShadow = "inset 0 3px 5px rgb(0 0 0 / 13%)";
  }
  return (
    <antd.Button
      onClick={props.onClick}
      type={type}
      disabled={props.disabled}
      style={style}
      size={size}
      className={props.className}
      href={props.href}
      target={props.target}
      danger={danger}
      ghost={ghost}
      loading={loading}
      title={props.title}
      tabIndex={props.tabIndex}
      id={props.id}
    >
      <>{props.children}</>
    </antd.Button>
  );
};

export function ButtonGroup(props: {
  style?: React.CSSProperties;
  children?: any;
}) {
  return (
    <antd.Button.Group style={props.style}>{props.children}</antd.Button.Group>
  );
}

export function ButtonToolbar(props: {
  style?: React.CSSProperties;
  children?: any;
  className?: string;
}) {
  return (
    <div className={props.className} style={props.style}>
      {r_join(props.children, <Space />)}
    </div>
  );
}

export function Grid(props: {
  onClick: any;
  style?: React.CSSProperties;
  children?: any;
}) {
  return (
    <div
      onClick={props.onClick}
      style={{ ...{ padding: "0 8px" }, ...props.style }}
    >
      {props.children}
    </div>
  );
}

export function Well(props: {
  style?: React.CSSProperties;
  children?: any;
  className?: string;
  onDoubleClick?;
  onMouseDown?;
}) {
  let style: React.CSSProperties = {
    ...{ backgroundColor: "white", border: "1px solid #e3e3e3" },
    ...props.style,
  };
  return (
    <antd.Card
      style={style}
      className={props.className}
      onDoubleClick={props.onDoubleClick}
      onMouseDown={props.onMouseDown}
    >
      {props.children}
    </antd.Card>
  );
}

export function Checkbox(props: {
  style?: React.CSSProperties;
  children?: any;
  autoFocus?: boolean;
  checked?: boolean;
  disabled?: boolean;
  onChange?: any;
}) {
  const style: React.CSSProperties = props.style != null ? props.style : {};
  if (style.fontWeight == null) {
    // antd. checkbox uses the label DOM element, and bootstrap css
    // changes the weight of that DOM element to 700, which is
    // really ugly and conflicts with the antd design style. So
    // we manualy change it back here.  This will go away if/when
    // we no longer include bootstrap css...
    style.fontWeight = 400;
  }
  // The margin and div is to be like react-bootstrap which
  // has that margin.
  return (
    <div style={{ margin: "10px 0" }}>
      <antd.Checkbox
        autoFocus={props.autoFocus}
        checked={props.checked}
        disabled={props.disabled}
        style={style}
        onChange={props.onChange}
      >
        {props.children}
      </antd.Checkbox>
    </div>
  );
}

export function Row(props: any) {
  props = { ...{ gutter: 16 }, ...props };
  return <antd.Row {...props}>{props.children}</antd.Row>;
}

export function Col(props: {
  xs?: number;
  sm?: number;
  md?: number;
  lg?: number;
  xsOffset?: number;
  smOffset?: number;
  mdOffset?: number;
  lgOffset?: number;
  style?: React.CSSProperties;
  className?: string;
  onClick?;
  children?: any;
}) {
  const props2: any = {};
  for (const p of ["xs", "sm", "md", "lg"]) {
    if (props[p] != null) {
      if (props2[p] == null) {
        props2[p] = {};
      }
      props2[p].span = 2 * props[p];
    }
    if (props[p + "Offset"] != null) {
      if (props2[p] == null) {
        props2[p] = {};
      }
      props2[p].offset = 2 * props[p + "Offset"];
    }
  }
  for (const p of ["className", "onClick", "style"]) {
    props2[p] = props[p];
  }
  return <antd.Col {...props2}>{props.children}</antd.Col>;
}

export function Tabs(props: {
  id?: string;
  key?: string;
  activeKey: string;
  onSelect?: (activeKey: string) => void;
  animation?: boolean;
  style?: React.CSSProperties;
  tabBarExtraContent?: React.ReactNode;
  tabPosition?: "left" | "top" | "right" | "bottom";
  size?: "small";
  children: any;
}) {
  // We do this because for antd, "There must be `tab` property on children of Tabs."
  let tabs: Rendered[] | Rendered = [];
  if (Symbol.iterator in Object(props.children)) {
    for (const x of props.children) {
      if (x == null || !x.props) continue;
      tabs.push(Tab(x.props));
    }
  } else {
    tabs = Tab(props.children);
  }
  return (
    <antd.Tabs
      activeKey={props.activeKey}
      onChange={props.onSelect}
      animated={props.animation ?? false}
      style={props.style}
      tabBarExtraContent={props.tabBarExtraContent}
      tabPosition={props.tabPosition}
      size={props.size}
    >
      {tabs}
    </antd.Tabs>
  );
}

export function Tab(props: {
  id?: string;
  key?: string;
  eventKey?: string;
  title: any;
  children?: any;
  style?: React.CSSProperties;
}) {
  let title = props.title;
  if (!title) {
    // In case of useless title, some sort of fallback.
    // This is important since a tab with no title can't
    // be selected.
    title = props.eventKey ?? props.key;
    if (!title) title = "Tab";
  }
  // Get rid of the fade transition, which is inconsistent with
  // react-bootstrap (and also really annoying to me). See
  // https://github.com/ant-design/ant-design/issues/951#issuecomment-176291275
  const style = { ...{ transition: "0s" }, ...props.style };

  return (
    <antd.Tabs.TabPane key={props.eventKey} tab={title} style={style}>
      {props.children}
    </antd.Tabs.TabPane>
  );
}

export function Modal(props: {
  show?: boolean;
  onHide: () => void;
  children?: any;
}) {
  return (
    <antd.Modal visible={props.show} footer={null} closable={false}>
      {props.children}
    </antd.Modal>
  );
}

Modal.Body = function (props: any) {
  return <>{props.children}</>;
};

export function Alert(props: {
  key?: string;
  bsStyle?: ButtonStyle;
  style?: React.CSSProperties;
  banner?: boolean;
  children?: any;
}) {
  let type: "success" | "info" | "warning" | "error" | undefined = undefined;
  // success, info, warning, error
  if (
    props.bsStyle == "success" ||
    props.bsStyle == "warning" ||
    props.bsStyle == "info"
  ) {
    type = props.bsStyle;
  } else if (props.bsStyle == "danger") {
    type = "error";
  } else if (props.bsStyle == "link") {
    type = "info";
  } else if (props.bsStyle == "primary") {
    type = "success";
  }
  return (
    <antd.Alert
      message={props.children}
      type={type}
      style={props.style}
      banner={props.banner}
    />
  );
}

export function Panel(props: {
  key?: string;
  style?: React.CSSProperties;
  header?: any;
  children?: any;
}) {
  const style = { ...{ marginBottom: "20px" }, ...props.style };
  return (
    <antd.Card
      style={style}
      title={props.header}
      headStyle={{ color: "#333", backgroundColor: "#f5f5f5" }}
    >
      {props.children}
    </antd.Card>
  );
}
