/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
I started with a copy of jupyter/complete.tsx, and will rewrite it
to be much more generically usable here, then hopefully use this
for jupyter, code editors, (etc.'s) complete.  E.g., I already
rewrote this to use the Antd dropdown, which is more dynamic.
*/

import type { MenuProps } from "antd";
import { Dropdown } from "antd";
import { FC, ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { CSS, ReactDOM } from "@cocalc/frontend/app-framework";
import { MenuItems } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

export interface Item {
  label?: ReactNode;
  value: string;
  search?: string; // useful for clients
}
interface Props0 {
  items: Item[]; // we assume at least one item
  onSelect: (value: string) => void;
  onCancel: () => void;
}

interface Props1 extends Props0 {
  offset: { left: number; top: number }; // offset relative to wherever you placed this in DOM
  position?: undefined;
}

interface Props2 extends Props0 {
  offset?: undefined;
  position: { left: number; top: number }; // or absolute position (doesn't matter where you put this in DOM).
}

type Props = Props1 | Props2;

// WARNING: Complete closing when clicking outside the complete box
// is handled in cell-list on_click.  This is ugly code (since not localized),
// but seems to work well for now.  Could move.
export const Complete: FC<Props> = (props: Props) => {
  const { items, onSelect, onCancel, offset, position } = props;
  const [selected, set_selected] = useState<number>(0);
  const selected_ref = useRef<number>(selected);
  useEffect(() => {
    selected_ref.current = selected;
  }, [selected]);
  const selected_keys_ref = useRef<string>();

  const select = useCallback(
    (e?) => {
      const key = e?.key ?? selected_keys_ref.current;
      if (typeof key === "string") {
        // best to just cancel.
        onSelect(key);
      } else {
        onCancel();
      }
    },
    [onSelect, onCancel]
  );

  const onKeyDown = useCallback(
    (e) => {
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
            // @ts-ignore
            $(".ant-menu-item-selected").scrollintoview();
          }
          break;
        case 40: // down arrow
          set_selected(selected_ref.current + 1);
          // @ts-ignore
          $(".ant-menu-item-selected").scrollintoview();
          break;
      }
    },
    [onCancel, onSelect]
  );

  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onCancel);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onCancel);
    };
  }, [onKeyDown, onCancel]);

  if (items.length == 0) return null;

  // The bottom margin wrapper below is so the current
  // line is not obscured if antd makes the menu *above*
  // the current line instead of below it.
  selected_keys_ref.current =
    items[selected % (items.length ? items.length : 1)]?.value;

  const menuItems: MenuItems = items.map(({ label, value }) => {
    return {
      key: value,
      label: label ?? value,
      style: { fontSize: "120%" },
    };
  });

  const menu: MenuProps = {
    selectedKeys: [selected_keys_ref.current],
    onClick: select,
    items: menuItems,
    style: {
      border: `1px solid ${COLORS.GRAY_L}`,
      maxHeight: "45vh", // so can always position menu above/below current line not obscuring it.
      overflow: "auto",
    },
  };

  function renderDropdown(): JSX.Element {
    return (
      <Dropdown
        menu={menu}
        open
        placement="topRight" // always on top, and paddingBottom makes the entire line visible
        overlayStyle={{ paddingBottom: "1em" }}
      >
        <span />
      </Dropdown>
    );
  }

  if (offset != null) {
    // Relative positioning of the popup (this is in the same React tree).
    return (
      <div style={{ position: "relative" }}>
        <div style={{ ...offset, position: "absolute" }}>
          {renderDropdown()}
        </div>
      </div>
    );
  } else if (position != null) {
    // Absolute position of the popup (this uses a totally different React tree)
    return (
      <Portal>
        <div style={{ ...STYLE, ...position }}>{renderDropdown()}</div>
      </Portal>
    );
  } else {
    throw Error("bug -- not possible");
  }
};

const Portal = ({ children }) => {
  return ReactDOM.createPortal(children, document.body);
};

const STYLE = {
  top: "-9999px",
  left: "-9999px",
  position: "absolute",
  zIndex: 1,
  padding: "3px",
  background: "white",
  borderRadius: "4px",
  boxShadow: "0 1px 5px rgba(0,0,0,.2)",
  overflowY: "auto",
  maxHeight: "50vh",
} as CSS;
