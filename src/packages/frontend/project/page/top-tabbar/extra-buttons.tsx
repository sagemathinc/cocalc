/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { ReactNode } from "react";
import type { MenuProps } from "antd";
import { Button as AntdButton, Dropdown } from "antd";

import { TypedMap, useMemo, useRedux } from "@cocalc/frontend/app-framework";
import { Icon, type IconName } from "@cocalc/frontend/components";
import { TopBarAction, TopBarActions } from "./types";

function renderIcon(icon: IconName | ReactNode | undefined): ReactNode {
  if (icon == null) return null;
  if (typeof icon === "string") return <Icon name={icon as IconName} />;
  return icon; // already a ReactNode
}

interface ExtraButtonsProps {
  editorActions: unknown;
  topBarActions: TopBarActions | null;
  name: string;
  compact: boolean;
  path: string;
}

export function ExtraButtons(
  props: Readonly<ExtraButtonsProps>,
): ReactNode {
  const { topBarActions, name, compact } = props;
  const local_view_state: TypedMap<{ active_id?: string; full_id?: string }> =
    useRedux(name, "local_view_state");

  function renderItem(conf: TopBarAction, index: number) {
    if (conf.type === "divider") {
      return { key: `${index}`, type: "divider" as const };
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
          {renderIcon(icon)} {label}
        </>
      ),
    };
  }

  const [top, items]: [TopBarAction | null, NonNullable<MenuProps["items"]>] =
    useMemo(() => {
      if (topBarActions == null || topBarActions.length === 0) {
        return [null, []];
      }

      const sorted = [...topBarActions].sort((a, b) => {
        if (a.type === "divider" || b.type === "divider") return 0;
        return (
          (b.priority ?? 0) - (a.priority ?? 0) ||
          (a.label ?? "").localeCompare(b.label ?? "")
        );
      });
      const top = sorted[0];
      const remainder = sorted.slice(1);
      return [top, remainder.map(renderItem)];
    }, [local_view_state, topBarActions, name, compact]);

  if (top == null) return null;
  if (top.type === "divider") return null;

  if (items.length === 0) {
    return (
      <AntdButton
        icon={renderIcon(top.icon)}
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
        {renderIcon(top.icon)}
        {compact ? null : ` ${top.label}`}
      </Dropdown.Button>
    );
  }
}
