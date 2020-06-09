/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { delay } from "awaiting";
import { List, Map } from "immutable";
import { Icon, Loading } from "../../../r_misc";
import { React, useRedux } from "../../../app-framework";
import { JupyterEditorActions } from "../actions";

interface Props {
  font_size: number;
  actions: JupyterEditorActions;
}

export const TableOfContents: React.FC<Props> = React.memo(
  ({ font_size, actions }) => {
    const contents: List<Map<string, any>> | undefined = useRedux([
      actions.jupyter_actions.name,
      "contents",
    ]);

    function render_header(
      level: number,
      value: string,
      icon: string
    ): JSX.Element {
      const style = { marginTop: 0 };
      const elt = (
        <>
          <Icon
            name={icon}
            style={{ width: "30px", display: "inline-block" }}
          />{" "}
          <a>{value}</a>
        </>
      );

      switch (level) {
        case 1:
          return <h1 style={style}>{elt}</h1>;
        case 2:
          return <h2 style={style}>{elt}</h2>;
        case 3:
          return <h3 style={style}>{elt}</h3>;
        case 4:
          return <h4 style={style}>{elt}</h4>;
        case 5:
          return <h5 style={style}>{elt}</h5>;
        default:
          return <h6 style={style}>{elt}</h6>;
      }
    }

    async function jump_to_cell(id:string): Promise<void> {
      actions.jump_to_cell(id);
      // stupid hack due to rendering/windowing delays...
      await delay(100);
      actions.jump_to_cell(id);
    }

    if (contents == null) {
      return <Loading theme="medium" />;
    }

    const v: JSX.Element[] = [];
    // todo: make better use of immutable.js, etc.
    for (let { id, level, value, icon, number } of contents.toJS()) {
      if (number != null) {
        value = `${number.join(".")}.  ${value}`;
      }
      v.push(
        <div
          key={id}
          onClick={() => jump_to_cell(id)}
          style={{ cursor: "pointer", paddingLeft: `${level * 2}em` }}
        >
          {render_header(level, value, icon)}
        </div>
      );
    }
    return (
      <div
        style={{
          overflowY: "auto",
          margin: "15px",
          fontSize: `${font_size - 4}px`,
        }}
      >
        {v}
      </div>
    );
  }
);
