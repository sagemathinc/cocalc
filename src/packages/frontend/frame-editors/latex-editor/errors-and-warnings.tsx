/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Show errors and warnings.
*/

import { Alert } from "antd";
import { sortBy } from "lodash";

import {
  CSS,
  React,
  Rendered,
  TypedMap,
  useRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, IconName, Loading } from "@cocalc/frontend/components";
import { EditorState } from "@cocalc/frontend/frame-editors/frame-tree/types";
import HelpMeFix from "@cocalc/frontend/frame-editors/llm/help-me-fix";
import { capitalize, is_different, path_split } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Actions } from "./actions";
import { use_build_logs } from "./hooks";
import { BuildLogs } from "./types";

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
  icon: IconName;
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
} as const;

const ITEM_STYLES: { [name: string]: CSS } = {
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
} as const;

interface item {
  line: number;
  file?: string;
  level: number;
  message?: string;
  content?: string;
}

interface ItemProps {
  actions: Actions;
  item: TypedMap<item>;
  group: string;
}

// memo has an update function, see bottom
const Item: React.FC<ItemProps> = React.memo(
  ({ actions, item, group }: ItemProps) => {
    function edit_source(e: React.SyntheticEvent<any>): void {
      e.stopPropagation();
      if (!item.get("file")) return; // not known
      const line = item.get("line");
      let path = item.get("file");
      const head = path_split(actions.path).head;
      if (head != "") {
        path = head + "/" + path;
      }
      if (!path) return;
      actions.goto_line_in_file(line, path);
      // Note: We don't call synctex_tex_to_pdf here because clicking on errors
      // should only jump to source, not trigger PDF sync
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

    function renderGetHelp() {
      if (!item.get("line") || group != "errors") return;
      const line = item.get("line");
      return (
        <HelpMeFix
          style={{ float: "right", marginLeft: "10px" }}
          size="small"
          task={"ran latex"}
          error={item.get("message") ?? ""}
          line={item.get("content") ?? ""}
          input={() => {
            const s = actions._syncstring.to_str();
            const v = s
              .split("\n")
              .slice(0, line + 1)
              .join("\n");
            //line+1 since lines are 1-based
            return v + `% this is line number ${line + 1}`;
          }}
          language={"latex"}
          extraFileInfo={actions.languageModelExtraFileInfo()}
          tag={"latex-error-frame"}
          prioritize="end"
        />
      );
    }

    return (
      <div style={ITEM_STYLES[item.get("level")]}>
        {renderGetHelp()}
        {render_location()}
        {item.get("message") && <div>{item.get("message")}</div>}
        {item.get("content") && <pre>{item.get("content")}</pre>}
      </div>
    );
  },
  (prev, next) => prev.item === next.item,
);

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
  editor_state: EditorState;
  is_fullscreen: boolean;
  project_id: string;
  path: string;
  reload?: number;
  font_size: number;
}

function should_memoize(prev, next): boolean {
  const props_diff = is_different(prev, next, ["status", "font_size", "knitr"]);
  // if props are different → don't memoize
  return !props_diff;
}

// the function above is used for React.memo, see bottom
export const ErrorsAndWarnings: React.FC<ErrorsAndWarningsProps> = React.memo(
  (props) => {
    const { name, actions } = props;

    const build_logs: BuildLogs = use_build_logs(name);
    const status: string = useRedux([name, "status"]) ?? "";
    const knitr: boolean = useRedux([name, "knitr"]);
    const includeError: string = useRedux([name, "includeError"]) ?? "";

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

    function render_item(item, key, group): Rendered {
      return <Item key={key} item={item} actions={actions} group={group} />;
    }

    function render_group_content(content, group): Rendered {
      if (content.size === 0) {
        return <div>None</div>;
      } else {
        const w: Rendered[] = [];
        content.forEach((item) => {
          w.push(render_item(item, w.length, group));
        });
        return <div>{w}</div>;
      }
    }

    function render_group(
      tool: string,
      group: string,
      num: number,
    ): MsgGroup | undefined {
      if (tool == "knitr" && !knitr) {
        return undefined;
      }
      const level = group_to_level(group);
      const spec: SpecItem = SPEC[level];
      const content = build_logs.getIn([tool, "parse", group]) as any;
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
          {render_group_content(content, group)}
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
        add(render_group("latex", group, 0)),
      );
      add(render_group("sagetex", "errors", 1));
      ["errors", "warnings"].forEach((group) =>
        add(render_group("knitr", group, 2)),
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
          Click the <Icon name="play-circle" /> Build button or hit shift+enter
          to run LaTeX.
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
        {includeError && (
          <Alert
            style={{ margin: "15px" }}
            type="error"
            showIcon
            message={"\\include error -- ensure all included files exist"}
            description={includeError.replace(/Error:/g, "")}
          />
        )}
        {render_hint()}
        {render_status()}
        {render_groups()}
      </div>
    );
  },
  should_memoize,
);
