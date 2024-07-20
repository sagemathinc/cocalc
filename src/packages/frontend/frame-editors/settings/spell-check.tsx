/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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

import { React, Rendered } from "@cocalc/frontend/app-framework";
import { DropdownMenu, Paragraph, Text } from "@cocalc/frontend/components";
import {
  MenuDivider,
  MenuItems,
} from "@cocalc/frontend/components/dropdown-menu";
import { is_different } from "@cocalc/util/misc";
import { DICTS, dict_desc } from "./aspell-dicts";

interface Props {
  value: string;
  set: Function;
  available: boolean;
}

export const SpellCheck: React.FC<Props> = React.memo(
  (props: Props) => {
    const { value, set, available } = props;

    function render_other_items(): MenuItems {
      const v: MenuItems = [];
      for (const lang of DICTS) {
        v.push({
          key: lang,
          label: dict_desc(lang),
          onClick: () => set(lang),
        });

        if (lang == "disabled") {
          v.push(MenuDivider);
        }
      }
      return v;
    }

    function render_dropdown(): Rendered {
      return (
        <DropdownMenu
          title={dict_desc(value)}
          button={true}
          items={render_other_items()}
        />
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

    if (available) {
      return (
        <>
          <Paragraph>
            <Text strong>Spellcheck language</Text> for this file
            {render_updates()}:
          </Paragraph>
          <Paragraph>{render_dropdown()}</Paragraph>
        </>
      );
    } else {
      return (
        <Paragraph>
          <Text strong>Spellcheck</Text> is not available for this editor.
        </Paragraph>
      );
    }
  },
  (prev, next) => !is_different(prev, next, ["value", "available"])
);
