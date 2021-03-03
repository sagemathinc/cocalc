/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// IMPORTANT: Currently not used since CodeMirror can now use native browser spellcheck!

/*
Spell check setting.  The options are:

 (*) Browser default (en-US)
 ( ) Disable spellcheck
 ( ) Other [dropdown menu with 400+ choices]

Internally which of the above is stored in a single string, with the following possibilities:

  - 'default' -- use browser default
  - 'disabled'
  - an entry in DICTS (one of the aspell dictionaries)

*/

import { React, Rendered } from "../../app-framework";
import { MenuItem, MenuDivider, DropdownMenu } from "smc-webapp/r_misc";
import { is_different } from "smc-util/misc";
import { DICTS, dict_desc } from "./aspell-dicts";

interface Props {
  value: string;
  set: Function;
  available: boolean;
}

export const SpellCheck: React.FC<Props> = React.memo(
  (props: Props) => {
    const { value, set, available } = props;

    function render_other_items(): Rendered[] {
      const v: Rendered[] = [];
      for (const lang of DICTS) {
        v.push(<MenuItem key={lang}>{dict_desc(lang)}</MenuItem>);
        if (lang == "disabled") {
          v.push(<MenuDivider key={"div"} />);
        }
      }
      return v;
    }

    function render_dropdown(): Rendered {
      return (
        <DropdownMenu
          title={dict_desc(value)}
          onClick={(lang) => set(lang)}
          button={true}
        >
          {render_other_items()}
        </DropdownMenu>
      );
    }

    function render_updates() {
      switch (value) {
        case "browser":
          return " (updates immediately)";
        case "disabled":
          return "";
        default:
          return " (updates on save to disk)";
      }
    }

    const style = { fontSize: "11pt", paddingRight: "10px" };
    if (available) {
      return (
        <div>
          <span style={style}>
            <b>Spellcheck language</b> for this file{render_updates()}:
          </span>
          {render_dropdown()}
        </div>
      );
    } else {
      return (
        <div>
          <span style={style}>
            <b>Spellcheck</b> is not available for this editor.
          </span>
        </div>
      );
    }
  },
  (prev, next) => !is_different(prev, next, ["value", "available"])
);
