/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List } from "immutable";
import { Icon, Loading } from "./index";
import { CSS, React, TypedMap } from "../app-framework";
import { Markdown } from "./markdown";

export interface TableOfContentsEntry {
  id: string; // id that is unique across the table of contents
  value: string; // contents of the heading -- a 1-line string formatted using markdown (will be rendered using markdown)
  level?: 1 | 2 | 3 | 4 | 5 | 6; // optional heading size/level
  icon?: string; // font awesome icon name -- default "minus" (a dash)
  number?: number[]; // section numbering, so for "- 1.2.4  A Subsction" this would be [1,2,4].
  extra?: any; // this is just passed back to the scrollTo function to provide extra info about how to scroll to this heading.
}

export type TableOfContentsEntryMap = TypedMap<TableOfContentsEntry>;
export type TableOfContentsEntryList = List<TableOfContentsEntryMap>;

interface Props {
  contents?: TableOfContentsEntryList; // an immutable.js List of entries, as above.
  scrollTo?: (TableOfContentsEntry) => void;
  style?: CSS;
}

export const TableOfContents: React.FC<Props> = React.memo(
  ({ contents, scrollTo, style }) => {
    function renderHeader(
      level: 1 | 2 | 3 | 4 | 5 | 6,
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
          <a style={{ display: "inline-block", marginBottom: "-1em" }}>
            <Markdown value={value} />
          </a>
        </>
      );
      // NOTE: the weird style for the a above is so the markdown
      // paragraph wrapper doesn't end up on a new line; it also removes
      // the extra 1em space at the bottom of that paragraph.   We could
      // redo this more cleanly by possibly using a special markdown
      // component that omits that top-level paragraph wrapping (and uses
      // react/slate?).

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

    if (contents == null) {
      return <Loading theme="medium" />;
    }

    function renderEntry(entry: TableOfContentsEntryMap): JSX.Element {
      let number = entry.get("number");
      let value = entry.get("value");
      if (number != null) {
        value = `${number.join(".")}.  ${value}`;
      }
      return (
        <div
          key={entry.get("id")}
          onClick={scrollTo != null ? () => scrollTo(entry.toJS()) : undefined}
          style={{
            cursor: "pointer",
            paddingLeft: `${entry.get("level", 1) * 2}em`,
          }}
        >
          {renderHeader(
            entry.get("level", 1),
            value,
            entry.get("icon", "minus")
          )}
        </div>
      );
    }

    const entries: JSX.Element[] = [];
    for (const entry of contents) {
      entries.push(renderEntry(entry));
    }
    return (
      <div
        style={{
          overflowY: "auto",
          height: "100%",
          paddingTop: "15px",
          ...style,
        }}
      >
        {entries}
      </div>
    );
  }
);
