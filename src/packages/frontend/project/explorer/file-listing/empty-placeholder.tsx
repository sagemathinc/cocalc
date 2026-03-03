/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useMemo } from "react";
import { Button } from "antd";

import { Icon, Text } from "@cocalc/frontend/components";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { FileTypeSelector } from "@cocalc/frontend/project/new";
import { useAvailableFeatures } from "@cocalc/frontend/project/use-available-features";
import { ACTIVE_FILTER_BTN_STYLE } from "@cocalc/frontend/project/explorer/action-bar";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { MainConfiguration } from "@cocalc/frontend/project_configuration";
import { COLORS } from "@cocalc/util/theme";
import { full_path_text } from "./utils";

interface Props {
  project_id: string;
  actions: ProjectActions;
  file_search: string;
  type_filter: string | null;
  create_file: (ext?: string, switch_over?: boolean) => void;
  create_folder: (switch_over?: boolean) => void;
  configuration_main?: MainConfiguration;
}

/**
 * Shown in the table body when there are no rows to display.
 *
 * - **Filtered-empty**: active type or name filter hides everything →
 *   show "no matches" with badge(s) to clear filters.
 * - **Truly empty**: the directory has no files at all →
 *   show "empty folder" header + FileTypeSelector for quick creation.
 */
export default function EmptyPlaceholder({
  project_id,
  actions,
  file_search,
  type_filter,
  create_file,
  create_folder,
  configuration_main,
}: Props) {
  const hasFilter = !!type_filter || !!file_search;

  return (
    <div>
      {hasFilter ? (
        <FilteredEmpty
          actions={actions}
          file_search={file_search}
          type_filter={type_filter}
          create_file={create_file}
          create_folder={create_folder}
          configuration_main={configuration_main}
        />
      ) : (
        <TrulyEmpty
          project_id={project_id}
          actions={actions}
          file_search={file_search}
          create_file={create_file}
          create_folder={create_folder}
          configuration_main={configuration_main}
        />
      )}
    </div>
  );
}

/** Active filters removed all files — show badges to clear them. */
function FilteredEmpty({
  actions,
  file_search,
  type_filter,
  create_file,
  create_folder,
  configuration_main,
}: {
  actions: ProjectActions;
  file_search: string;
  type_filter: string | null;
  create_file: (ext?: string, switch_over?: boolean) => void;
  create_folder: (switch_over?: boolean) => void;
  configuration_main?: MainConfiguration;
}) {
  const actualNewFilename = useMemo(() => {
    if (!file_search) return "";
    return full_path_text(file_search, configuration_main?.disabled_ext ?? []);
  }, [file_search, configuration_main?.disabled_ext]);

  const buttonText =
    file_search.length === 0 ? (
      "Create or Upload Files..."
    ) : (
      <>Create {actualNewFilename}</>
    );

  return (
    <div
      style={{
        textAlign: "center",
        padding: "40px 20px",
        color: COLORS.GRAY_M,
      }}
    >
      <div style={{ fontSize: "14pt", marginBottom: 12 }}>
        No files match the current filters.
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {type_filter != null && (
          <Button
            type="text"
            size="small"
            style={ACTIVE_FILTER_BTN_STYLE}
            onClick={() => actions.setState({ type_filter: undefined } as any)}
          >
            {type_filter === "folder"
              ? "Folder"
              : (file_options(`file.${type_filter}`)?.name ??
                `.${type_filter}`)}{" "}
            <Icon name="times-circle" />
          </Button>
        )}
        {file_search && (
          <Button
            type="text"
            size="small"
            style={ACTIVE_FILTER_BTN_STYLE}
            onClick={() => actions.set_file_search("")}
          >
            Contains &ldquo;{file_search}&rdquo; <Icon name="times-circle" />
          </Button>
        )}
      </div>
      <Button
        type="primary"
        size="large"
        style={{
          height: "80px",
          fontSize: "24px",
          padding: "30px",
        }}
        onClick={() => {
          if (file_search.length === 0) {
            actions.set_active_tab("new");
          } else if (file_search.endsWith("/")) {
            create_folder();
          } else {
            create_file();
          }
        }}
      >
        <Icon name="plus-circle" /> {buttonText}
      </Button>
    </div>
  );
}

/** Directory is genuinely empty — offer file creation. */
function TrulyEmpty({
  project_id,
  actions,
  file_search,
  create_file,
  create_folder,
  configuration_main,
}: {
  project_id: string;
  actions: ProjectActions;
  file_search: string;
  create_file: (ext?: string, switch_over?: boolean) => void;
  create_folder: (switch_over?: boolean) => void;
  configuration_main?: MainConfiguration;
}) {
  const availableFeatures = useAvailableFeatures(project_id);

  const actualNewFilename = useMemo(() => {
    if (file_search.length === 0) return "";
    return full_path_text(file_search, configuration_main?.disabled_ext ?? []);
  }, [file_search, configuration_main?.disabled_ext]);

  return (
    <div
      style={{
        textAlign: "center",
        padding: "30px 20px",
        color: COLORS.GRAY_M,
      }}
    >
      <div style={{ fontSize: "14pt", marginBottom: 8 }}>
        This folder is empty.
      </div>
      <div style={{ fontSize: "11pt", marginBottom: 16, color: COLORS.GRAY_L }}>
        Create files using the buttons below, or type a filename in the search
        box and press{" "}
        <Text keyboard>
          <span style={{ color: COLORS.GRAY_D }}>Shift+Return</span>
        </Text>
        .
      </div>
      <FileTypeSelector
        create_file={create_file}
        create_folder={() => create_folder()}
        projectActions={actions}
        availableFeatures={availableFeatures}
        filename={actualNewFilename}
      />
    </div>
  );
}
