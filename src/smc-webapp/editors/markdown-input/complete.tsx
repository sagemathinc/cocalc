/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
I started with a copy of jupyter/complete.tsx, and will rewrite it
to be much more generically usable here, then hopefully use this
for jupyter, code editors, (etc.'s) complete.

TODO:
 - redo the html using antd rather than css styles from bootstrap, e.g., maybe https://ant.design/components/popover/
 - goal is support vscode like functionality, eventually, in addition to jupyter autocomplete and @mentions.
*/

import { React, useEffect, useRef, useState } from "../../app-framework";

import { Dropdown, Menu } from "antd";

export interface Item {
  elt?: JSX.Element;
  value: string;
}

interface Props {
  items: Item[]; // we assume at least one item
  onSelect: (value: string) => void;
  onCancel: () => void;
  style?: React.CSSProperties;
}

// WARNING: Complete closing when clicking outside the complete box
// is handled in cell-list on_click.  This is ugly code (since not localized),
// but seems to work well for now.  Could move.
export const Complete: React.FC<Props> = ({
  items,
  onSelect,
  onCancel,
  style,
}) => {
  const [selected, set_selected] = useState<number>(0);
  const selected_ref = useRef<number>(selected);
  useEffect(() => {
    selected_ref.current = selected;
  }, [selected]);

  function select(item?: string): void {
    onSelect(item ?? items[selected_ref.current]?.value ?? items[0]?.value);
  }

  function render_item({ elt, value }: Item): JSX.Element {
    return <Menu.Item key={value}>{elt ? elt : value}</Menu.Item>;
  }

  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onCancel);
    // blur the codemirror or it gets some of the keyboard
    (document.activeElement as any).blur();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onCancel);
    };
  }, []);

  function onKeyDown(e: any): void {
    e.preventDefault();
    e.stopPropagation();
    switch (e.keyCode) {
      case 27:
        onCancel();
        break;
      case 13:
        select();
        break;
      case 38: // up arrow
        set_selected(
          selected_ref.current == 0
            ? items.length - 1
            : selected_ref.current - 1
        );
        break;
      case 40: // down arrow
        set_selected(
          selected_ref.current == items.length - 1
            ? 0
            : selected_ref.current + 1
        );
        break;
    }
  }

  const menu = (
    <Menu
      selectedKeys={[items[selected]?.value]}
      onClick={(e) => select(e.key)}
      style={{
        ...{
          border: "1px solid lightgrey",
        },
        ...style,
      }}
    >
      {items.map(render_item)}
    </Menu>
  );

  return (
    <Dropdown overlay={menu} visible={true}>
      <span />
    </Dropdown>
  );
};
