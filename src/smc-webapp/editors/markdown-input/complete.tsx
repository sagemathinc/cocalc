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

declare const $: any;

import { React, useEffect, useRef } from "../../app-framework";

export interface Item {
  elt?: JSX.Element;
  value: string;
}

interface Props {
  items: Item[];
  onSelect?: (value: string) => void;
  onCancel?: () => void;
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
  const node_ref = useRef(null);

  function select(item: string): void {
    onSelect?.(item);
  }

  function render_item({ elt, value }: Item): JSX.Element {
    return (
      <li key={value}>
        <a role="menuitem" tabIndex={-1} onClick={() => select(value)}>
          {elt ? elt : value}
        </a>
      </li>
    );
  }

  useEffect(() => {
    $(window).on("keypress", onKeyDown);
    $(node_ref.current).find("a:first").focus();
    return () => {
      $(window).off("keypress", onKeyDown);
    };
  }, []);

  useEffect(() => {
    $(node_ref.current).find("a:first").focus();
  });

  function onKeyDown(e: any): void {
    if (e.keyCode === 27) {
      onCancel?.();
    }
    if (e.keyCode !== 13) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    // TODO
    //$(node_ref.current).find("a:focus").click();
  }

  return (
    <div className="dropdown open" style={style} ref={node_ref}>
      <ul className="dropdown-menu cocalc-complete" onKeyDown={onKeyDown}>
        {items.map(render_item)}
      </ul>
    </div>
  );
};
