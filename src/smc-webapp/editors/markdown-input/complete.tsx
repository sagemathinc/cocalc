/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
I started with a copy of jupyter/complete.tsx, and will rewrite it
to be much more generically usable here, then hopefully use this
for jupyter, code editors, (etc.'s) complete.

TODOS:
 - I didn't make it scroll selected item into view when you're
   using the keyboard to navigate.
*/

import { React, useEffect, useRef, useState } from "../../app-framework";

import { Dropdown, Menu } from "antd";

export interface Item {
  elt?: JSX.Element;
  value: string;
  search?: string; // useful for clients
}

interface Props {
  items: Item[]; // we assume at least one item
  onSelect: (value: string) => void;
  onCancel: () => void;
  offset: { left: number; top: number };
}

// WARNING: Complete closing when clicking outside the complete box
// is handled in cell-list on_click.  This is ugly code (since not localized),
// but seems to work well for now.  Could move.
export const Complete: React.FC<Props> = ({
  items,
  onSelect,
  onCancel,
  offset,
}) => {
  const [selected, set_selected] = useState<number>(0);
  const selected_ref = useRef<number>(selected);
  useEffect(() => {
    selected_ref.current = selected;
  }, [selected]);
  const selected_keys_ref = useRef<string>();

  function select(key?: string): void {
    if (key == null) {
      key = selected_keys_ref.current;
    }
    if (key == null) {
      // best too just cancel.
      onCancel();
    } else {
      onSelect(key);
    }
  }

  function render_item({ elt, value }: Item): JSX.Element {
    return <Menu.Item key={value}>{elt ? elt : value}</Menu.Item>;
  }

  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onCancel);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onCancel);
    };
  }, []);

  function onKeyDown(e: any): void {
    switch (e.keyCode) {
      case 27:
        onCancel();
        break;
      case 13:
        select();
        break;
      case 38: // up arrow
        if (selected_ref.current >= 1) {
          set_selected(selected_ref.current - 1);
        }
        break;
      case 40: // down arrow
        set_selected(selected_ref.current + 1);
        break;
    }
  }

  // The bottom margin wrapper below is so the current
  // line is not obscured if antd makes the menu *above*
  // the current line instead of below it.
  selected_keys_ref.current =
    items[selected % (items.length ? items.length : 1)]?.value;
  const menu = (
    <div style={{ marginBottom: "15px" }}>
      <Menu
        selectedKeys={[selected_keys_ref.current]}
        onClick={(e) => select(e.key)}
        style={{
          border: "1px solid lightgrey"}}
          maxHeight: "45vh", // so can always position menu above/below current line not obscuring it.
          overflow: "auto",
        }}*/
      >
        {items.map(render_item)}
      </Menu>
    </div>
  );

  return (
    <div style={{ position: "relative" }}>
      <div style={{ ...offset, position: "absolute" }}>
        <Dropdown overlay={menu} visible={true}>
          <span />
        </Dropdown>
      </div>
    </div>
  );
};
