/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { FC, CSSProperties, memo } from "react";
import {
  Icon,
  UncommittedChanges,
  VisibleMDLG,
} from "@cocalc/frontend/components";
import { Button } from "antd";

interface Props {
  has_unsaved_changes?: boolean;
  has_uncommitted_changes?: boolean;
  read_only?: boolean;
  is_public?: boolean;
  is_saving?: boolean;
  no_labels?: boolean;
  size?;
  onClick?: (e) => void;
  show_uncommitted_changes?: boolean;
  set_show_uncommitted_changes?: Function;
  style?: CSSProperties;
}

export const SaveButton: FC<Props> = memo((props: Props) => {
  const {
    has_unsaved_changes,
    has_uncommitted_changes,
    read_only,
    is_public,
    is_saving,
    no_labels,
    size,
    onClick,
    show_uncommitted_changes,
    set_show_uncommitted_changes,
    style,
  } = props;

  function make_label() {
    if (!no_labels) {
      if (is_public) {
        return "Public";
      } else if (read_only) {
        return "Readonly";
      } else {
        return "Save";
      }
    } else {
      return "";
    }
  }

  const disabled: boolean = !has_unsaved_changes || !!read_only || !!is_public;
  const label = make_label();
  const icon = is_saving ? "arrow-circle-o-left" : "save";

  // The funny style in the icon below is because the width changes
  // slightly depending on which icon we are showing.
  // whiteSpace:"nowrap" due to https://github.com/sagemathinc/cocalc/issues/4434
  return (
    <Button
      title={"Save file to disk"}
      size={size}
      disabled={disabled}
      onClick={onClick}
      style={{
        background: "#5cb85c",
        color: "white",
        opacity: disabled ? 0.65 : undefined,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <Icon name={icon} style={{ width: "15px", display: "inline-block" }} />{" "}
      <VisibleMDLG>{label}</VisibleMDLG>
      <UncommittedChanges
        has_uncommitted_changes={has_uncommitted_changes}
        show_uncommitted_changes={show_uncommitted_changes}
        set_show_uncommitted_changes={set_show_uncommitted_changes}
      />
    </Button>
  );
});
