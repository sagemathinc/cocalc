/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../app-framework";

export function renderElement(props): JSX.Element {
  if (props.element.tag) {
    // We use some extra classes for certain tags so things just look better.
    let className: undefined | string = undefined;
    if (props.element.tag == "table") {
      className = "table";
    }
    return React.createElement(
      props.element.tag,
      { ...props.attributes, ...props.element.attrs, ...{ className } },
      props.children
    );
  }
  switch (props.element.type) {
    case "html_inline":
      return (
        <code
          {...props.attributes}
          {...props.element.attrs}
          style={{ color: "#666" }}
        >
          {props.children}
        </code>
      );
    default:
      return (
        <p {...props.attributes} {...props.element.attrs}>
          {props.children}
        </p>
      );
  }
}
