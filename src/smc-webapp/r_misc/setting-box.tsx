import * as React from "react";
import { Icon } from "./icon";
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

export function SettingBox({
  icon,
  title,
  title_el,
  close,
  children,
  show_header = true,
}: Props) {
  function render_header() {
    if (!show_header) {
      return;
    }
    const final_title = title != undefined ? title : title_el;
    if (final_title == undefined) {
      return;
    }

    return (
      <h3>
        <Icon name={icon} /> {final_title}
        {close ? <CloseX2 close={close} /> : undefined}
      </h3>
    );
  }

  return <Panel header={render_header()}>{children}</Panel>;
}
