/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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

import {
  Alert as AntdAlert,
  Button as AntdButton,
  Card as AntdCard,
  Checkbox as AntdCheckbox,
  Col as AntdCol,
  Modal as AntdModal,
  Row as AntdRow,
  Switch as AntdSwitch,
  Tabs as AntdTabs,
  TabsProps as AntdTabsProps,
  Space,
  Tooltip,
} from "antd";
import type { MouseEventHandler } from "react";

import { inDarkMode } from "@cocalc/frontend/account/dark-mode";
import { Gap } from "@cocalc/frontend/components/gap";
import { r_join } from "@cocalc/frontend/components/r_join";
import { COLORS } from "@cocalc/util/theme";
import { CSS } from "./app-framework";

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
  | "link"
  | "ghost";

const BS_STYLE_TO_TYPE: {
  [name in ButtonStyle]:
    | "primary"
    | "default"
    | "dashed"
    | "danger"
    | "link"
    | "text";
} = {
  primary: "primary",
  success: "default", // antd doesn't have this so we do it via style below.
  default: "default",
  info: "default", // antd doesn't have this so we do it via style below.
  warning: "default", // antd doesn't have this so we do it via style below.
  danger: "danger",
  link: "link",
  ghost: "text",
};

export type ButtonSize = "large" | "small" | "xsmall";

function parse_bsStyle(props: {
  bsStyle?: ButtonStyle;
  style?: React.CSSProperties;
  disabled?: boolean;
}): {
  type: "primary" | "default" | "dashed" | "link" | "text";
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
  if (!inDarkMode()) {
    if (props.bsStyle === "warning") {
      // antd has no analogue of "warning", it's not clear to me what
      // it should be so for
      // now just copy the style.
      style = {
        backgroundColor: COLORS.BG_WARNING,
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
  key?;
  children?: any;
  className?: string;
  href?: string;
  target?: string;
  title?: string | React.JSX.Element;
  tabIndex?: number;
  active?: boolean;
  id?: string;
  autoFocus?: boolean;
  placement?;
  block?: boolean;
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
  const btn = (
    <AntdButton
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
      tabIndex={props.tabIndex}
      id={props.id}
      autoFocus={props.autoFocus}
      block={props.block}
    >
      <>{props.children}</>
    </AntdButton>
  );
  if (props.title) {
    return (
      <Tooltip
        title={props.title}
        mouseEnterDelay={0.7}
        placement={props.placement}
      >
        {btn}
      </Tooltip>
    );
  } else {
    return btn;
  }
};

export function ButtonGroup(props: {
  style?: React.CSSProperties;
  children?: any;
  className?: string;
}) {
  return (
    <Space.Compact className={props.className} style={props.style}>
      {props.children}
    </Space.Compact>
  );
}

export function ButtonToolbar(props: {
  style?: React.CSSProperties;
  children?: any;
  className?: string;
}) {
  return (
    <div className={props.className} style={props.style}>
      {r_join(props.children, <Gap />)}
    </div>
  );
}

export function Grid(props: {
  onClick?: MouseEventHandler<HTMLDivElement>;
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
    <AntdCard
      style={style}
      className={props.className}
      onDoubleClick={props.onDoubleClick}
      onMouseDown={props.onMouseDown}
    >
      {props.children}
    </AntdCard>
  );
}

export function Checkbox(props) {
  const style: React.CSSProperties = props.style != null ? props.style : {};
  if (style.fontWeight == null) {
    // Antd checkbox uses the label DOM element, and bootstrap css
    // changes the weight of that DOM element to 700, which is
    // really ugly and conflicts with the antd design style. So
    // we manually change it back here.  This will go away if/when
    // we no longer include bootstrap css...
    style.fontWeight = 400;
  }
  // The margin and div is to be like react-bootstrap which
  // has that margin.
  return (
    <div style={{ margin: "10px 0" }}>
      <AntdCheckbox {...{ ...props, style }}>{props.children}</AntdCheckbox>
    </div>
  );
}

export function Switch(props: {
  checked?: boolean;
  onChange?: (e: { target: { checked: boolean } }) => void;
  disabled?: boolean;
  style?: CSS;
  labelStyle?: CSS;
  children?: any;
}) {
  const { style = {}, labelStyle = {} } = props;

  // Default font weight for label
  const finalLabelStyle: CSS = {
    fontWeight: 400,
    ...labelStyle,
  };

  const handleChange = (checked: boolean) => {
    if (props.onChange) {
      // Call onChange with same signature as Checkbox - event object with target.checked
      props.onChange({ target: { checked } });
    }
  };

  return (
    <div style={{ margin: "15px 0" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          ...style,
        }}
      >
        <AntdSwitch
          checked={props.checked}
          onChange={handleChange}
          disabled={props.disabled}
        />
        <span
          onClick={() => !props.disabled && handleChange(!props.checked)}
          style={{
            ...finalLabelStyle,
            cursor: props.disabled ? "default" : "pointer",
          }}
        >
          {props.children}
        </span>
      </div>
    </div>
  );
}

export function Row(props: any) {
  props = { ...{ gutter: 16 }, ...props };
  return <AntdRow {...props}>{props.children}</AntdRow>;
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
  push?;
  pull?;
}) {
  const props2: any = {};
  for (const p of ["xs", "sm", "md", "lg", "push", "pull"]) {
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
  return <AntdCol {...props2}>{props.children}</AntdCol>;
}

export type AntdTabItem = NonNullable<AntdTabsProps["items"]>[number];

interface TabsProps {
  id?: string;
  key?;
  activeKey: string;
  onSelect?: (activeKey: string) => void;
  animation?: boolean;
  style?: React.CSSProperties;
  tabBarExtraContent?;
  tabPosition?: "left" | "top" | "right" | "bottom";
  size?: "small";
  items: AntdTabItem[]; // This is mandatory: Tabs.TabPane (was in "Tab") is deprecated.
}

export function Tabs(props: Readonly<TabsProps>) {
  return (
    <AntdTabs
      activeKey={props.activeKey}
      onChange={props.onSelect}
      animated={props.animation ?? false}
      style={props.style}
      tabBarExtraContent={props.tabBarExtraContent}
      tabPosition={props.tabPosition}
      size={props.size}
      items={props.items}
    />
  );
}

export function Tab(props: {
  id?: string;
  key?: string;
  eventKey: string;
  title: string | React.JSX.Element;
  children?: any;
  style?: React.CSSProperties;
}): AntdTabItem {
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

  return {
    key: props.key ?? props.eventKey,
    label: title,
    style,
    children: props.children,
  };
}

export function Modal(props: {
  show?: boolean;
  onHide: () => void;
  children?: any;
}) {
  return (
    <AntdModal open={props.show} footer={null} closable={false}>
      {props.children}
    </AntdModal>
  );
}

Modal.Body = function (props: any) {
  return <>{props.children}</>;
};

interface AlertProps {
  bsStyle?: ButtonStyle;
  style?: React.CSSProperties;
  banner?: boolean;
  children?: any;
  icon?: React.JSX.Element;
}

export function Alert(props: AlertProps) {
  const { bsStyle, style, banner, children, icon } = props;

  let type: "success" | "info" | "warning" | "error" | undefined = undefined;
  // success, info, warning, error
  if (bsStyle == "success" || bsStyle == "warning" || bsStyle == "info") {
    type = bsStyle;
  } else if (bsStyle == "danger") {
    type = "error";
  } else if (bsStyle == "link") {
    type = "info";
  } else if (bsStyle == "primary") {
    type = "success";
  }
  return (
    <AntdAlert
      message={children}
      type={type}
      style={style}
      banner={banner}
      icon={icon}
    />
  );
}

const PANEL_DEFAULT_STYLES: { header: CSS } = {
  header: { color: COLORS.GRAY_DD, backgroundColor: COLORS.GRAY_LLL },
} as const;

export function Panel(props: {
  key?;
  style?: React.CSSProperties;
  styles?: {
    header?: React.CSSProperties;
    body?: React.CSSProperties;
  };
  header?;
  children?: any;
  onClick?;
  size?: "small";
}) {
  const style: CSS = { ...{ marginBottom: "20px" }, ...props.style };

  const styles = {
    ...PANEL_DEFAULT_STYLES,
    ...props.styles,
  };

  return (
    <AntdCard
      style={style}
      title={props.header}
      styles={styles}
      onClick={props.onClick}
      size={props.size}
    >
      {props.children}
    </AntdCard>
  );
}
