/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
I started with a copy of jupyter/complete.tsx, and will rewrite it
to be much more generically usable here, then hopefully use this
for Jupyter, code editors, (etc.'s) complete.  E.g., I already
rewrote this to use the Antd dropdown, which is more dynamic.
*/

import type { MenuProps } from "antd";
import { Dropdown } from "antd";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { CSS } from "@cocalc/frontend/app-framework";
import ReactDOM from "react-dom";
import type { MenuItems } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { strictMod } from "@cocalc/util/misc";
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
export function Complete({
  items,
  onSelect,
  onCancel,
  offset,
  position,
}: Props) {
  const items_user = items.filter((item) => !(item.is_llm ?? false));

  // All other LLMs that should not show up in the main menu
  const items_llm = items.filter(
    (item) =>
      (item.is_llm ?? false) &&
      // if search eliminates all users, we show all LLMs
      (items_user.length === 0 || !item.show_llm_main_menu),
  );

  const haveLLMs = items_llm.length > 0;
  // note: if onlyLLMs is true, we treat LLMs as if they're users and do not show a sub-menu
  // this causes the sub-menu to "collapse" if there are no users left to show
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
  const selected_key_ref = useRef<string | undefined>(undefined);

  useEffect(() => {
    selected_user_ref.current = selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    selected_llm_ref.current = selectedLLM;
  }, [selectedLLM]);

  useEffect(() => {
    llm_ref.current = llm || onlyLLMs;
  }, [llm, onlyLLMs]);

  useEffect(() => {
    // if we show the LLM sub-menu and we scroll to it using the keyboard, we pop it open
    // Hint: these can be equal, if there is one more virtual entry in selectedUser!
    if (selectedUser === items_user.length) {
      setLLM(true);
    }
  }, [selectedUser]);

  const select = useCallback(
    (e?) => {
      const key = e?.key ?? selected_key_ref.current;
      if (typeof key === "string" && key !== "sub_llm") {
        onSelect(key);
      }
      if (key === "sub_llm") {
        setLLM(!llm);
      } else {
        // best to just cancel.
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
          $(".ant-dropdown-menu-item-selected").scrollintoview();
          break;

        case 40: // down arrow
          (isLLM ? setSelectedLLM : setSelectedUser)(n + 1);
          // @ts-ignore
          $(".ant-dropdown-menu-item-selected").scrollintoview();
          break;

        case 39: // right arrow key
          if (haveLLMs) setLLM(true);
          // @ts-ignore
          $(".ant-dropdown-menu-item-selected").scrollintoview();
          break;

        case 37: // left arrow key
          setLLM(false);
          // @ts-ignore
          $(".ant-dropdown-menu-item-selected").scrollintoview();
          break;
      }
    },
    [onCancel, onSelect],
  );

  useEffect(() => {
    // for clicks, we only listen on the root of the app – otherwise clicks on
    // e.g. the menu items and the sub-menu always trigger a close action
    // (that popup menu is outside the root in the DOM)
    const root = document.getElementById("cocalc-webapp-container");
    document.addEventListener("keydown", onKeyDown);
    root?.addEventListener("click", onCancel);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      root?.removeEventListener("click", onCancel);
    };
  }, [onKeyDown, onCancel]);

  selected_key_ref.current = (() => {
    if (llm || onlyLLMs) {
      const len: number = items_llm.length ?? 1;
      const i = strictMod(selectedLLM, len);
      return items_llm[i]?.value;
    } else {
      let len: number = items_user.length ?? 1;
      if (!onlyLLMs && haveLLMs) {
        len += 1;
      }
      const i = strictMod(selectedUser, len);
      if (i < len) {
        return items_user[i]?.value;
      } else {
        return "sub_llm";
      }
    }
  })();

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
        <div style={{ ...style, display: "flex", alignItems: "center" }}>
          <AIAvatar size={22} />{" "}
          <span style={{ marginLeft: "5px" }}>More AI Language Models</span>
        </div>
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

  if (menuItems.length == 0) {
    menuItems.push({ key: "nothing", label: "No items found", disabled: true });
  }

  // NOTE: the AI LLM sub-menu is either opened by hovering (clicking closes immediately) or by right-arrow key
  const menu: MenuProps = {
    selectedKeys: [selected_key_ref.current],
    onClick: (e) => {
      if (e.key !== "sub_llm") {
        select(e);
      }
    },
    items: menuItems,
    openKeys: llm ? ["sub_llm"] : [],
    onOpenChange: (openKeys) => {
      // this, and the right-left-arrow keys control opening the LLM sub-menu
      setLLM(openKeys.includes("sub_llm"));
    },
    mode: "vertical",
    subMenuCloseDelay: 3,
    style: {
      border: `1px solid ${COLORS.GRAY_L}`,
      maxHeight: "45vh", // so can always position menu above/below current line not obscuring it.
      overflow: "auto",
    },
  };

  function renderDropdown(): React.JSX.Element {
    return (
      <Dropdown
        menu={menu}
        open
        trigger={["click", "hover"]}
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
