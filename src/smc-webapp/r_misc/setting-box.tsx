import * as React from "react";
import { Icon } from "./icon"
import { CloseX2 } from "./close-x2";

const { Panel } = require("react-bootstrap");

interface Props {
  icon: string;
  title?: string;
  title_el?: JSX.Element;
  show_header?: boolean;
  close?: () => void;
  children?: React.ReactNode;
}

export function SettingBox(props: Props) {
  function render_header() {
    if (!props.show_header) {
      return;
    }
    const title = props.title != undefined ? props.title : props.title_el;
    if (title == undefined) {
      return;
    }

    return (
      <h3>
        <Icon name={props.icon} /> {title}
        {props.close ? <CloseX2 close={props.close} /> : undefined}
      </h3>
    );
  }

  return <Panel header={render_header()}>{props.children}</Panel>;
}
