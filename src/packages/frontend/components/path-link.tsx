/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  endswith,
  path_split,
  separate_file_extension,
  trunc_middle,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { handleFileEntryClick } from "../project/history/utils";
import { Tip } from "./tip";

interface Props {
  path: string;
  project_id: string;
  display_name?: string; // if provided, show this as the link and show real name in popover
  full?: boolean; // true = show full path, false = show only basename
  trunc?: number; // truncate longer names and show a tooltip with the full name
  style?: React.CSSProperties;
  link?: boolean; // set to false to make it not be a link
  onOpen?: () => void; // called if link is clicked on to open it.
}

// Component to attempt opening a cocalc path in a project
export const PathLink: React.FC<Props> = ({
  path,
  project_id,
  full = false,
  trunc,
  display_name,
  style = {},
  link = true,
  onOpen,
}: Props) => {
  function render_link(text): React.JSX.Element {
    let s;
    if (!endswith(text, "/")) {
      const { name, ext } = separate_file_extension(text);
      if (ext) {
        s = (
          <>
            {name}
            <span style={{ color: "#999" }}>.{ext}</span>
          </>
        );
      } else {
        s = name;
      }
    } else {
      s = text;
    }
    if (link) {
      return (
        <a
          onClick={(e) => {
            onOpen?.();
            handleFileEntryClick(e, path, project_id);
          }}
          style={{ color: COLORS.GRAY_D, fontWeight: "bold", ...style }}
        >
          {s}
        </a>
      );
    } else {
      return <span style={style}>{s}</span>;
    }
  }

  const name = full ? path : path_split(path).tail;
  if (
    (trunc != null && name.length > trunc) ||
    (display_name != null && display_name !== name)
  ) {
    let text;
    if (trunc != null) {
      text = trunc_middle(display_name != null ? display_name : name, trunc);
    } else {
      text = display_name != null ? display_name : name;
    }
    return (
      <Tip title="" tip={name}>
        {render_link(text)}
      </Tip>
    );
  } else {
    return render_link(name);
  }
};
