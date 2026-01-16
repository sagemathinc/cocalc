/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Popover } from "antd";
import { CSSProperties } from "react";
import { Icon, LabeledRow, Markdown } from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { Config, RowType, Tag } from "@cocalc/util/db-schema/site-defaults";
import { COLORS } from "@cocalc/util/theme";
import { Data, IsReadonly } from "./types";
import { RowEntry } from "./row-entry";

interface RenderRowProps {
  name: string;
  conf: Config;
  data: Data | null;
  update: () => void;
  isReadonly: IsReadonly | null;
  onChangeEntry: (name: string, value: string) => void;
  onJsonEntryChange: (name: string, value: string) => void;
  filterStr: string;
  filterTag: Tag | null;
  isModified: (name: string) => boolean;
  isHeader: boolean;
  saveSingleSetting: (name: string) => void;
}

export function RenderRow({
  name,
  conf,
  data,
  update,
  isReadonly,
  onChangeEntry,
  onJsonEntryChange,
  filterStr,
  filterTag,
  isModified,
  isHeader,
  saveSingleSetting,
}: RenderRowProps) {
  if (data == null) return null;

  // if tags are used, we're strictly filtering by them
  if (filterTag) {
    if (!conf.tags) return null;
    if (!conf.tags.includes(filterTag)) {
      return null;
    }
  }
  // otherwise we're (additionally) filtering by the search string
  if (filterStr) {
    const { tags, name: title, desc } = conf;
    const f = filterStr.toLowerCase();
    const match_any_tag = tags && tags.includes(f as any);
    const x = [name, title, desc]
      .join(" ")
      .toLowerCase()
      .replace(/-/g, " ")
      .replace(/_/g, " ");
    if (!x.includes(f) && !match_any_tag) {
      return null;
    }
  }
  if (conf.cocalc_only) {
    if (!document.location.host.endsWith("cocalc.com")) {
      return null;
    }
  }
  // don't show certain fields, i.e. where show evals to false
  if (typeof conf.show == "function" && !conf.show(data)) {
    return null;
  }

  const rawValue = data[name] ?? conf.default;
  const rowType: RowType = conf.type ?? "setting";

  // fallbacks: to_display? → to_val? → undefined
  const parsed_value: string | undefined =
    typeof conf.to_display == "function"
      ? `${conf.to_display(rawValue)}`
      : typeof conf.to_val == "function"
      ? `${conf.to_val(rawValue, data)}`
      : undefined;

  // not currently supported.
  // const clearable = conf.clearable ?? false;

  const label = (
    <div style={{ paddingRight: "15px" }}>
      <strong>{conf.name}</strong> <RowHelp help={conf.help} />
      <br />
      <StaticMarkdown style={{ color: COLORS.GRAY_M }} value={conf.desc} />
    </div>
  );

  const hint = <RowHint conf={conf} rawValue={rawValue} />;

  let style = { marginTop: "15px", paddingLeft: "10px" } as CSSProperties;
  // indent optional fields
  if (typeof conf.show == "function" && rowType == "setting") {
    style = {
      ...style,
      borderLeft: `2px solid ${COLORS.GRAY}`,
      marginLeft: "0px",
      marginTop: "0px",
    } as CSSProperties;
  }

  function renderRowExtra() {
    if (isHeader) return null;
    const modified = isModified(name);
    return (
      <Button
        type={modified ? "primary" : "default"}
        disabled={!modified}
        size="middle"
        icon={<Icon name="save" />}
        onClick={() => saveSingleSetting(name)}
      />
    );
  }

  return (
    <LabeledRow
      label={label}
      key={name}
      style={style}
      label_cols={6}
      extra={renderRowExtra()}
    >
      <RowEntry
        name={name}
        value={rawValue}
        password={conf.password ?? false}
        displayed_val={parsed_value}
        valid={conf.valid}
        hint={hint}
        rowType={rowType}
        multiline={conf.multiline}
        isReadonly={isReadonly}
        onJsonEntryChange={onJsonEntryChange}
        onChangeEntry={onChangeEntry}
        clearable={conf.clearable}
        update={update}
      />
    </LabeledRow>
  );
}

function RowHint({ conf, rawValue }: { conf: Config; rawValue: string }) {
  if (typeof conf.hint == "function") {
    return <Markdown value={conf.hint(rawValue)} />;
  } else {
    return null;
  }
}

function RowHelp({ help }: { help?: string }) {
  if (typeof help !== "string") return null;
  return (
    <Popover
      content={
        <StaticMarkdown
          className={"admin-site-setting-popover-help"}
          style={{ fontSize: "90%" }}
          value={help}
        />
      }
      trigger={["hover", "click"]}
      placement="right"
      overlayStyle={{ maxWidth: "500px" }}
    >
      <Icon style={{ color: COLORS.GRAY }} name="question-circle" />
    </Popover>
  );
}
