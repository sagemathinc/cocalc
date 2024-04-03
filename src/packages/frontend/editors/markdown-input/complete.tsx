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
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { CSS, ReactDOM } from "@cocalc/frontend/app-framework";
import { MenuItems } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { COLORS } from "@cocalc/util/theme";

export interface Item {
  label?: ReactNode;
  value: string;
  search?: string; // useful for clients
  is_llm?: boolean; // if true, then this is an LLM in a sub-menu
  show_llm_main_menu?: boolean; // if true, then this LLM is also show in the main menu (not just the sub-menu)
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
export function Complete(props: Props) {
  const { items, onSelect, onCancel, offset, position } = props;

  const items_user = items.filter((item) => !(item.is_llm ?? false));

  // All other LLMs that should not show up in the main menu
  const items_llm = items.filter(
    (item) =>
      (item.is_llm ?? false) &&
      // if search elimites all users, we show all LLMs
      (items_user.length === 0 || !item.show_llm_main_menu),
  );

  const haveLLMs = items_llm.length > 0;
  // note: if onlyLLMs is true, we treat LLMs as if they're users and do not show a submenu
  // this causes the submenu to "collapse" if there are no users left to show
  const onlyLLMs = haveLLMs && items_user.length === 0;

  // If we render a sub-menu, add LLMs that should should show up in the main menu
  if (!onlyLLMs) {
    for (const item of items) {
      if (item.is_llm && item.show_llm_main_menu) {
        items_user.unshift(item);
      }
    }
  }

  const [selectedUser, setSelectedUser] = useState<number>(0);
  const [selectedLLM, setSelectedLLM] = useState<number>(0);
  const [llm, setLLM] = useState<boolean>(false);

  const llm_ref = useRef<boolean>(llm);
  const selected_user_ref = useRef<number>(selectedUser);
  const selected_llm_ref = useRef<number>(selectedLLM);

  useEffect(() => {
    selected_user_ref.current = selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    selected_llm_ref.current = selectedLLM;
  }, [selectedLLM]);

  useEffect(() => {
    llm_ref.current = llm || onlyLLMs;
  }, [llm, onlyLLMs]);

  const selected_key_ref = useRef<string>();

  const select = useCallback(
    (e?) => {
      const key = e?.key ?? selected_key_ref.current;
      if (typeof key === "string") {
        // best to just cancel.
        onSelect(key);
      } else {
        onCancel();
      }
    },
    [onSelect, onCancel],
  );

  const onKeyDown = useCallback(
    (e) => {
      const isLLM = llm_ref.current;
      const n = (isLLM ? selected_llm_ref : selected_user_ref).current;
      switch (e.keyCode) {
        case 27: // escape key
          onCancel();
          break;

        case 13: // enter key
          select();
          break;

        case 38: // up arrow key
          (isLLM ? setSelectedLLM : setSelectedUser)(n - 1);
          // @ts-ignore
          $(".ant-menu-item-selected").scrollintoview();
          break;

        case 40: // down arrow
          (isLLM ? setSelectedLLM : setSelectedUser)(n + 1);
          // @ts-ignore
          $(".ant-menu-item-selected").scrollintoview();
          break;

        case 39: // right arrow key
          if (haveLLMs) setLLM(true);
          // @ts-ignore
          $(".ant-menu-item-selected").scrollintoview();
          break;

        case 37: // left arrow key
          setLLM(false);
          // @ts-ignore
          $(".ant-menu-item-selected").scrollintoview();
          break;
      }
    },
    [onCancel, onSelect],
  );

  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onCancel);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onCancel);
    };
  }, [onKeyDown, onCancel]);

  if (items.length === 0) return null;

  selected_key_ref.current =
    llm || onlyLLMs
      ? items_llm[selectedLLM % (items_llm.length ? items_llm.length : 1)]
          ?.value
      : items_user[selectedUser % (items_user.length ? items_user.length : 1)]
          ?.value;

  const style: CSS = { fontSize: "115%" } as const;

  // we collapse to just showing the LLMs if the search ended up only showing LLMs
  const menuItems: MenuItems = (onlyLLMs ? items_llm : items_user).map(
    ({ label, value }) => {
      return {
        key: value,
        label: label ?? value,
        style,
      };
    },
  );

  if (haveLLMs && !onlyLLMs) {
    // we put this at the very end – the default LLM (there is always one) is at the start, then are the users, then this
    menuItems.push({
      key: "sub_llm",
      label: (
        <span style={style}>
          <AIAvatar size={22} /> More Language Models
        </span>
      ),
      style,
      children: items_llm.map(({ label, value }) => {
        return {
          key: value,
          label: label ?? value,
          style: { fontSize: "90%" }, // not as large as the normal user items
        };
      }),
    });
  }

  // NOTE: the AI LLM submenu is either opened by hovering (clicking closes immediately) or by right-arrow key
  const menu: MenuProps = {
    selectedKeys: [selected_key_ref.current],
    onClick: select,
    items: menuItems,
    openKeys: llm ? ["sub_llm"] : [],
    onOpenChange: (openKeys) => {
      // this, and the right-left-arrow keys control opening the llm submenu
      setLLM(openKeys.includes("sub_llm"));
    },
    mode: "vertical",
    subMenuCloseDelay: 1.5,
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
        placement="top" // always on top, and paddingBottom makes the entire line visible
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
}

const Portal = ({ children }) => {
  return ReactDOM.createPortal(children, document.body);
};

const STYLE: CSS = {
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
} as const;
