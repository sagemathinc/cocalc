/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { List as AntdList, Avatar, Button } from "antd";
import { List } from "immutable";
import { useIntl } from "react-intl";

import { Icon } from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { filenameIcon } from "@cocalc/frontend/file-associations";
import { labels } from "@cocalc/frontend/i18n";
import { path_split, plural } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

import { Actions } from "./actions";
import { OUTPUT_HEADER_STYLE } from "./util";

interface FileListItem {
  path: string;
  displayPath: string;
  isMain: boolean;
  summary: string;
}

interface OutputFilesProps {
  switch_to_files: List<string>;
  path: string;
  fileSummaries: { [key: string]: string };
  summariesLoading: boolean;
  refreshSummaries: () => void;
  actions: Actions;
  uiFontSize: number;
}

export function OutputFiles({
  switch_to_files,
  path,
  fileSummaries,
  summariesLoading,
  refreshSummaries,
  actions,
  uiFontSize,
}: OutputFilesProps) {
  const intl = useIntl();

  // Filter out the main file from the list
  const subFiles = switch_to_files
    .filter((filePath) => filePath !== path)
    .sort();
  const subFileCount = subFiles.size;

  // Compute the common prefix to strip (directory of main file)
  const prefix = path_split(path).head;
  const prefixWithSlash = prefix ? prefix + "/" : "";

  const listData = subFiles.toJS().map((filePath: string) => {
    const displayPath = filePath.startsWith(prefixWithSlash)
      ? filePath.slice(prefixWithSlash.length)
      : filePath;
    return {
      path: filePath,
      displayPath,
      isMain: false,
      summary: fileSummaries[filePath] ?? "Summary not available...",
    };
  });

  return (
    <div
      className="smc-vfill"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Fixed header with buttons and file count */}
      <div style={OUTPUT_HEADER_STYLE}>
        <Button
          type="primary"
          size="small"
          icon={<Icon name="tex-file" />}
          onClick={() => actions.switch_to_file(path)}
        >
          Open Main File
        </Button>

        <span style={{ color: COLORS.GRAY_M, fontSize: uiFontSize }}>
          {subFileCount} {plural(subFileCount, "subfile")}
        </span>

        <Button
          size="small"
          icon={<Icon name="refresh" />}
          onClick={refreshSummaries}
          loading={summariesLoading}
          disabled={summariesLoading}
        >
          {intl.formatMessage(labels.refresh)}
        </Button>
      </div>

      {/* Scrollable list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px",
        }}
      >
        <AntdList
          size="small"
          dataSource={listData}
          renderItem={(item: FileListItem) => (
            <AntdList.Item
              style={{
                cursor: "pointer",
              }}
              onClick={() => actions.switch_to_file(item.path)}
            >
              <AntdList.Item.Meta
                avatar={
                  <Avatar
                    size="default"
                    style={{
                      backgroundColor: "transparent",
                      color: COLORS.GRAY_D,
                    }}
                    icon={<Icon name={filenameIcon(item.path)} />}
                  />
                }
                title={
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: `${uiFontSize}px`,
                    }}
                  >
                    {item.displayPath}
                  </span>
                }
                description={
                  <span
                    style={{
                      color: COLORS.GRAY_M,
                      fontSize: uiFontSize - 2,
                    }}
                  >
                    <StaticMarkdown value={item.summary} />
                  </span>
                }
              />
            </AntdList.Item>
          )}
        />
      </div>
    </div>
  );
}
