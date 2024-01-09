/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import type { MenuProps } from "antd";
import { Button as AntdButton, Dropdown } from "antd";

import { TypedMap, useMemo, useRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { TopBarAction, TopBarActions } from "./types";

interface ExtraButtonsProps {
  topBarActions: TopBarActions | null;
  name: string;
  compact: boolean;
  shareIndicator?: JSX.Element;
}

export function ExtraButtons(
  props: Readonly<ExtraButtonsProps>,
): JSX.Element | null {
  const { topBarActions, name, compact, shareIndicator = null } = props;
  const local_view_state: TypedMap<{ active_id?: string; full_id?: string }> =
    useRedux(name, "local_view_state");

  function renderItem(conf: TopBarAction, index: number) {
    const { getAction, label, icon, hoverText } = conf;
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
        (a, b) =>
          (b.priority ?? 0) - (a.priority ?? 0) ||
          (a.label ?? "").localeCompare(b.label ?? ""),
      );
      const top = sorted[0];
      const remainder = sorted.slice(1) ?? [];
      return [top, remainder.map(renderItem)];
    }, [local_view_state, topBarActions, name, compact]);

  if (top == null) return shareIndicator;

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
