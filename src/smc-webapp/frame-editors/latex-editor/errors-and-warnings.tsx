/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Show errors and warnings.
*/

import { Map } from "immutable";
import { sortBy } from "lodash";
import { capitalize, is_different, path_split } from "smc-util/misc2";
import { React, Rendered, useRedux } from "../../app-framework";
import { TypedMap } from "../../app-framework/TypedMap";
import { BuildLogs } from "./actions";
import { Icon, Loading } from "smc-webapp/r_misc";
import { COLORS } from "../../../smc-util/theme";

function group_to_level(group: string): string {
  switch (group) {
    case "errors":
      return "error";
    case "warnings":
      return "warning";
    default:
      return group;
  }
}

export interface SpecItem {
  icon: string;
  color: string;
}

export interface SpecDesc {
  error: SpecItem;
  typesetting: SpecItem;
  warning: SpecItem;
}

export const SPEC: SpecDesc = {
  error: {
    icon: "bug",
    color: "#a00",
  },
  typesetting: {
    icon: "exclamation-circle",
    color: "rgb(66, 139, 202)",
  },
  warning: {
    icon: "exclamation-triangle",
    color: "#fdb600",
  },
};

const ITEM_STYLES = {
  warning: {
    borderLeft: `2px solid ${SPEC.warning.color}`,
    padding: "15px",
    margin: "5px 0",
  },
  error: {
    borderLeft: `2px solid ${SPEC.error.color}`,
    padding: "15px",
    margin: "5px 0",
  },
  typesetting: {
    borderLeft: `2px solid ${SPEC.typesetting.color}`,
    padding: "15px",
    margin: "5px 0",
  },
};

interface item {
  line: string;
  file?: string;
  level: number;
  message?: string;
  content?: string;
}

interface ItemProps {
  actions: any;
  item: TypedMap<item>;
}

const ItemFC: React.FC<ItemProps> = (props) => {
  const { actions, item } = props;

  function edit_source(e: React.SyntheticEvent<any>): void {
    e.stopPropagation();
    if (!item.get("file")) return; // not known
    const line: number = parseInt(item.get("line"));
    let path = item.get("file");
    const head = path_split(actions.path).head;
    if (head != "") {
      path = head + "/" + path;
    }
    if (!path) return;
    actions.goto_line_in_file(line, path);
    actions.synctex_tex_to_pdf(line, 0, item.get("file"));
  }

  function render_location(): React.ReactElement<any> | undefined {
    if (!item.get("line")) {
      return;
    }
    // https://github.com/sagemathinc/cocalc/issues/3413
    const file = item.get("file");

    if (file) {
      return (
        <div>
          <a
            onClick={(e) => edit_source(e)}
            style={{ cursor: "pointer", float: "right" }}
          >
            Line {item.get("line")} of {file}
          </a>
        </div>
      );
    } else {
      return <div>Line {item.get("line")}</div>;
    }
  }

  function render_message(): React.ReactElement<any> | undefined {
    const message = item.get("message");
    if (!message) {
      return;
    }
    return <div>{message}</div>;
  }

  function render_content(): React.ReactElement<any> | undefined {
    const content = item.get("content");
    if (!content) {
      return;
    }
    return <pre>{content}</pre>;
  }

  return (
    <div style={ITEM_STYLES[item.get("level")]}>
      {render_location()}
      {render_message()}
      {render_content()}
    </div>
  );
};

const Item = React.memo(ItemFC, (prev, next) => prev.item === next.item);

interface MsgGroup {
  rendered: Rendered;
  level: string;
  group: string;
  size: number;
}

interface ErrorsAndWarningsProps {
  id: string;
  name: string;
  actions: any;
  editor_state: Map<string, any>;
  is_fullscreen: boolean;
  project_id: string;
  path: string;
  reload: number;
  font_size: number;
}

const ErrorsAndWarningsFC: React.FC<ErrorsAndWarningsProps> = (props) => {
  const {
    /*id,*/
    name,
    actions,
    /*editor_state,*/
    /*is_fullscreen,*/
    /*project_id,*/
    /*path,*/
    /*reload,*/
    /*font_size,*/
  } = props;

  const build_logs_next: BuildLogs =
    useRedux([name, "build_logs"]) ?? Map<string, any>();
  const [build_logs, set_build_logs] = React.useState<BuildLogs>(
    Map<string, any>()
  );

  // only update if any parsed logs differ
  for (const key of ["latex", "knitr", "pythontex", "sagetex"]) {
    if (
      build_logs_next.getIn([key, "parse"]) != build_logs.getIn([key, "parse"])
    ) {
      set_build_logs(build_logs_next);
      break;
    }
  }

  const status: string = useRedux([name, "status"]) ?? "";
  const knitr: boolean = useRedux([name, "knitr"]);

  function render_status(): Rendered {
    if (status) {
      return (
        <div
          style={{
            margin: "5px",
            right: 0,
            background: "white",
            paddingLeft: "5px",
          }}
        >
          <Loading
            text={status}
            style={{
              fontSize: "10pt",
              color: COLORS.GRAY,
            }}
          />
        </div>
      );
    }
  }

  function render_item(item, key): Rendered {
    return <Item key={key} item={item} actions={actions} />;
  }

  function render_group_content(content): Rendered {
    if (content.size === 0) {
      return <div>None</div>;
    } else {
      const w: Rendered[] = [];
      content.forEach((item) => {
        w.push(render_item(item, w.length));
      });
      return <div>{w}</div>;
    }
  }

  function render_group(
    tool: string,
    group: string,
    num: number
  ): MsgGroup | undefined {
    if (tool == "knitr" && !knitr) {
      return undefined;
    }
    const level = group_to_level(group);
    const spec: SpecItem = SPEC[level];
    const content = build_logs.getIn([tool, "parse", group]);
    if (!content) {
      return;
    }
    const header = (
      <>
        <Icon name={spec.icon} style={{ color: spec.color }} />{" "}
        {capitalize(group)} ({capitalize(tool)})
      </>
    );
    const rendered = (
      <div key={`${group}-${num}`}>
        {content.size == 0 ? <h5>{header}</h5> : <h3>{header}</h3>}
        {render_group_content(content)}
      </div>
    );
    return { rendered, level, group, size: content.size };
  }

  // in particular, we want to show actual errors at the top
  // (otherwise, e.g. sagetex errors are burried below typesetting warnings)
  function priority(group: MsgGroup) {
    if (group.size == 0) return 0;
    // lower index number comes first
    const grouporder = ["errors", "typesetting", "warnings"];
    // see group_to_level
    const level = { error: 100, warning: 10 }[group.level] ?? 0;
    return -level + grouporder.indexOf(group.group);
  }

  function render_groups(): Rendered[] {
    const groups: MsgGroup[] = [];
    const add = (group) => {
      if (group != null) groups.push(group);
    };
    ["errors", "typesetting", "warnings"].forEach((group) =>
      add(render_group("latex", group, 0))
    );
    add(render_group("sagetex", "errors", 1));
    ["errors", "warnings"].forEach((group) =>
      add(render_group("knitr", group, 2))
    );
    add(render_group("pythontex", "errors", 3));

    return sortBy(groups, priority).map((g) => g.rendered);
  }

  function render_hint(): Rendered {
    if (status || build_logs.size > 0) {
      return;
    }
    return (
      <div style={{ color: COLORS.GRAY }}>
        Click the <Icon name="play-circle" /> Build button or hit shift+enter to
        run LaTeX.
      </div>
    );
  }

  return (
    <div
      className={"smc-vfill"}
      style={{
        overflowY: "scroll",
        padding: "5px 15px",
        fontSize: "10pt",
      }}
    >
      {render_hint()}
      {render_status()}
      {render_groups()}
    </div>
  );
};

function should_memoize(prev, next): boolean {
  const props_diff = is_different(prev, next, ["status", "font_size", "knitr"]);
  // if props are different → don't memoize
  return !props_diff;
}

export const ErrorsAndWarnings = React.memo(
  ErrorsAndWarningsFC,
  should_memoize
);
