/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { ButtonProps } from "antd";
import { Button } from "antd";
import { CSSProperties, useMemo } from "react";
import { useIntl } from "react-intl";

import {
  Icon,
  UncommittedChanges,
  VisibleMDLG,
} from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";

interface Props {
  has_unsaved_changes?: boolean;
  has_uncommitted_changes?: boolean;
  read_only?: boolean;
  is_public?: boolean;
  is_saving?: boolean;
  no_labels?: boolean;
  size?: ButtonProps["size"];
  onClick?: (e) => void;
  show_uncommitted_changes?: boolean;
  set_show_uncommitted_changes?: Function;
  style?: CSSProperties;
  type?: "default"; // only used to turn off color in case of dark mode right now
}

export function SaveButton({
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
  type,
}: Props) {
  const intl = useIntl();

  const label = useMemo(() => {
    if (!no_labels) {
      return intl.formatMessage(labels.frame_editors_title_bar_save_label, {
        type: is_public ? "is_public" : read_only ? "read_only" : "save",
      });
    } else {
      return null;
    }
  }, [no_labels, is_public, read_only]);

  const disabled = useMemo(
    () => !has_unsaved_changes || !!read_only || !!is_public,
    [has_unsaved_changes, read_only, is_public],
  );

  const icon = useMemo(
    () => (is_saving ? "arrow-circle-o-left" : "save"),
    [is_saving],
  );

  function renderLabel() {
    if (!no_labels && label) {
      return <VisibleMDLG>{` ${label}`}</VisibleMDLG>;
    }
  }

  // The funny style in the icon below is because the width changes
  // slightly depending on which icon we are showing.
  // whiteSpace:"nowrap" due to https://github.com/sagemathinc/cocalc/issues/4434
  return (
    <Button
      size={size}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...(type == "default"
          ? undefined
          : { background: "#5cb85c", color: "#333" }),
        opacity: disabled ? 0.65 : undefined,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <Icon name={icon} style={{ display: "inline-block" }} />
      {renderLabel()}
      <UncommittedChanges
        has_uncommitted_changes={has_uncommitted_changes}
        show_uncommitted_changes={show_uncommitted_changes}
        set_show_uncommitted_changes={set_show_uncommitted_changes}
      />
    </Button>
  );
}
