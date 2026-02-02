/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { List } from "immutable";
import { useMemo } from "react";

import { CSS, TypedMap } from "@cocalc/frontend/app-framework";
import { Icon, IconName, Loading } from "./index";
import { Markdown } from "./markdown";

export interface TableOfContentsEntry {
  id: string; // id that is jumped to when entry is clicked -- must be unique across the table of contents
  value: string; // contents of the heading -- a 1-line string formatted using markdown (will be rendered using markdown)
  level?: 1 | 2 | 3 | 4 | 5 | 6; // optional heading size/level
  icon?: IconName; // default "minus" (a dash)
  number?: number[]; // section numbering, so for "- 1.2.4  A Subsection" this would be [1,2,4]; omitted if not given.
  extra?: any; // this is just passed back to the scrollTo function to provide extra info about how to scroll to this heading.
}

export type TableOfContentsEntryMap = TypedMap<TableOfContentsEntry>;
export type TableOfContentsEntryList = List<TableOfContentsEntryMap>;

interface Props {
  contents?: TableOfContentsEntryList; // an immutable.js List of entries, as above.
  scrollTo?: (TableOfContentsEntry) => void;
  style?: CSS;
  // show numbers and font sizes is disabled by default -- see https://github.com/sagemathinc/cocalc/issues/7746
  showNumbers?: boolean;
  fontSizes?: boolean;
  fontSize?: number;
  ifEmpty?: React.ReactNode;
}

export function TableOfContents(props: Props) {
  if (props.contents == null) {
    return <Loading theme="medium" />;
  }

  if (props.contents.size === 0 && props.ifEmpty != null) {
    return <>{props.ifEmpty}</>;
  }

  return <TableOfContentsBody {...props} />;
}

function TableOfContentsBody(props: Props) {
  return useMemo(() => {
    const entries: React.JSX.Element[] = [];
    for (const entry of props.contents ?? []) {
      entries.push(<Entry {...props} entry={entry} />);
    }
    return (
      <div
        style={{
          overflowY: "auto",
          height: "100%",
          paddingTop: "15px",
          fontSize: `${props.fontSize ?? 14}px`,
        }}
      >
        {entries}
      </div>
    );
  }, [props.showNumbers, props.contents, props.fontSizes, props.fontSize]);
}

function Entry({
  entry,
  scrollTo,
  showNumbers,
  fontSizes,
}: {
  entry: TableOfContentsEntryMap;
  scrollTo?: (TableOfContentsEntry) => void;
  showNumbers?: boolean;
  fontSizes?: boolean;
}) {
  let number = entry.get("number");
  let value = entry.get("value");
  if (showNumbers && number != null) {
    value = `${number.join(".")}.  ${value}`;
  }
  return (
    <div
      key={entry.get("id")}
      onClick={scrollTo != null ? () => scrollTo(entry.toJS()) : undefined}
      style={{
        cursor: "pointer",
      }}
    >
      <Header
        level={entry.get("level", 1)}
        value={value}
        icon={entry.get("icon")}
        fontSizes={fontSizes}
      />
    </div>
  );
}

function Header({
  level,
  value,
  icon,
  fontSizes,
}: {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  value: string;
  icon?: IconName;
  fontSizes?: boolean;
}) {
  if (level < 1) level = 1;
  if (level > 6) level = 6;
  const fontSize = fontSizes ? `${1 + (7 - level) / 6}em` : undefined;
  return (
    <div
      style={{
        /*marginTop: level == 1 ? "1em" : level == 2 ? "0.5em" : undefined,*/
        fontSize,
        whiteSpace: "nowrap",
        fontWeight: level == 1 ? "bold" : undefined,
      }}
    >
      <span
        style={{
          width: level == 1 ? "15px" : level == 2 ? "25px" : "35px",
          display: "inline-block",
        }}
      >
        {icon && (
          <Icon name={icon} style={{ marginLeft: "10px", color: "#666" }} />
        )}
      </span>
      <a
        style={{
          display: "inline-block",
          marginBottom: "-1em",
          marginLeft: "10px",
        }}
      >
        <Markdown value={"&nbsp;" + value} />
      </a>
    </div>
  );

  // NOTE: the weird style for the a above is so the markdown
  // paragraph wrapper doesn't end up on a new line; it also removes
  // the extra 1em space at the bottom of that paragraph.   We could
  // redo this more cleanly by possibly using a special markdown
  // component that omits that top-level paragraph wrapping (and uses
  // react/slate?).
}
