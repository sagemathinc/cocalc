/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import type { MenuProps } from "antd";
import { Button as AntdButton, Dropdown } from "antd";

import { TypedMap, useMemo, useRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { file_actions } from "@cocalc/frontend/project_store";
import { capitalize } from "@cocalc/util/misc";
import { EditorActions, TopBarAction, TopBarActions } from "./types";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { useProjectContext } from "../../context";

interface ExtraButtonsProps {
  editorActions: EditorActions;
  topBarActions: TopBarActions | null;
  name: string;
  compact: boolean;
  shareIndicator?: JSX.Element;
  path: string;
}

export function ExtraButtons(
  props: Readonly<ExtraButtonsProps>,
): JSX.Element | null {
  const {
    // editorActions,
    topBarActions,
    name,
    compact,
    path,
    shareIndicator = null,
  } = props;
  const local_view_state: TypedMap<{ active_id?: string; full_id?: string }> =
    useRedux(name, "local_view_state");
  const { project_id, actions } = useProjectContext();
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);
  const fullscreen: undefined | "default" | "kiosk" = useRedux(
    "page",
    "fullscreen",
  );

  function renderItem(conf: TopBarAction, index: number) {
    if (conf.type === "divider") {
      return { key: `${index}`, type: "divider" };
    }
    const { getAction, label, icon, tooltip: hoverText } = conf;
    const action = conf.action ?? getAction?.(local_view_state);

    return {
      key: `${index}`,
      onClick: action,
      disabled: action == null,
      title: hoverText,
      label: (
        <>
          <Icon name={icon} /> {label}
        </>
      ),
    };
  }

  function appendFileActions(items: TopBarAction[]) {
    // We don't show this menu in kiosk mode, where none of the options make sense,
    // because they are all file management, which should be handled a different way.
    if (fullscreen === "kiosk") return;
    if (student_project_functionality.disableActions) return;
    if (items.length > 0) {
      items.push({ type: "divider" });
    }
    for (const key in file_actions) {
      const { name, icon, hideFlyout = false } = file_actions[key];
      if (hideFlyout) continue;
      // we have a separate publish button right next to it
      if (name === "share") continue;
      items.push({
        type: "entry",
        label: `${capitalize(name)}`,
        icon,
        action: () => {
          actions?.show_file_action_panel({ path, action: key });
        },
      });
    }
  }

  // the active_id or other view related aspects might change, so we need to
  // re-render this component if that happens.
  const [top, items]: [TopBarAction | null, NonNullable<MenuProps["items"]>] =
    useMemo(() => {
      if (topBarActions == null) {
        return [null, []];
      }

      // pick the first action from topBarActions, which has the highest priority attribute
      const sorted = topBarActions.sort(
        // sort by .priority (a number) and then by .label (a string)
        (a, b) => {
          if (a.type === "divider" || b.type === "divider") return 0;
          return (
            (b.priority ?? 0) - (a.priority ?? 0) ||
            (a.label ?? "").localeCompare(b.label ?? "")
          );
        },
      );
      const top = sorted[0];
      const remainder = sorted.slice(1) ?? [];
      appendFileActions(remainder);
      return [top, remainder.map(renderItem)];
    }, [local_view_state, topBarActions, name, compact]);

  if (top == null) return shareIndicator;
  if (top.type === "divider") throw new Error("should not happen");

  if (items.length === 0) {
    return (
      <AntdButton
        icon={<Icon name={top.icon} />}
        onClick={top.action ?? top.getAction?.(local_view_state)}
      >
        {compact ? null : top.label}
      </AntdButton>
    );
  } else {
    return (
      <Dropdown.Button
        icon={<Icon name="chevron-down" />}
        trigger={["click"]}
        menu={{ items }}
        onClick={top.action ?? top.getAction?.(local_view_state)}
      >
        <Icon name={top.icon} />
        {compact ? null : ` ${top.label}`}
      </Dropdown.Button>
    );
  }
}
