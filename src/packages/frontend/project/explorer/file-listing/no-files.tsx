/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { useMemo } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { Paragraph, Text } from "@cocalc/frontend/components";
import { Icon } from "@cocalc/frontend/components/icon";
import { labels } from "@cocalc/frontend/i18n";
import { FileTypeSelector } from "@cocalc/frontend/project/new";
import { useAvailableFeatures } from "@cocalc/frontend/project/use-available-features";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { MainConfiguration } from "@cocalc/frontend/project_configuration";
import { capitalize } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { HelpAlert } from "./help-alert";
import { full_path_text } from "./utils";
import { default_filename } from "@cocalc/frontend/account";
import { join } from "path";

interface Props {
  name: string;
  actions: ProjectActions;
  file_search: string;
  current_path?: string;
  project_id: string;
  configuration_main?: MainConfiguration;
}

export default function NoFiles({
  actions,
  file_search = "",
  current_path,
  project_id,
  configuration_main,
}: Props) {
  const intl = useIntl();
  const availableFeatures = useAvailableFeatures(project_id);
  const { buttonText, actualNewFilename } = useMemo(() => {
    const actualNewFilename =
      file_search.length === 0
        ? ""
        : full_path_text(file_search, configuration_main?.disabled_ext ?? []);

    const buttonText =
      file_search.length === 0 ? (
        `${intl.formatMessage({
          id: "project.explorer.file-listing.no-files.button",
          defaultMessage: "Create or Upload Files",
          description:
            "Button label to open a dialog to create or upload files",
        })}...`
      ) : (
        <>
          {capitalize(intl.formatMessage(labels.create))} {actualNewFilename}
        </>
      );
    return { buttonText, actualNewFilename };
  }, [file_search, configuration_main?.disabled_ext, intl]);

  if (configuration_main == null) return null;

  return (
    <div
      style={{
        wordWrap: "break-word",
        overflowY: "auto",
        padding: "0 30px",
        margin: "0 -15px", // This negative margin is because this is placed inside a big Row/Col grid.
      }}
      className="smc-vfill"
    >
      <h4 style={{ color: COLORS.GRAY_M }}>
        <FormattedMessage
          id="project.explorer.file-listing.no-files.no-files-found"
          defaultMessage={`{filtering, select,
            true {No files matching {file_search} found}
            other {No files found}}`}
          description={
            "Indicate there are no files in the directory or no files found when there is an active filter."
          }
          values={{
            filtering: !!file_search?.trim(),
            file_search,
          }}
        />
      </h4>
      <hr />
      <Button
        size="large"
        type="primary"
        style={{
          margin: "0 auto",
          height: "80px",
          fontSize: "24px",
          padding: "30px",
        }}
        onClick={(): void => {
          if (!file_search?.trim()) {
            actions.set_active_tab("new");
          } else if (file_search[file_search.length - 1] === "/") {
            actions.createFolder({
              name: join(current_path ?? "", file_search),
            });
          } else {
            actions.createFile({
              name: join(current_path ?? "", actualNewFilename),
            });
          }
        }}
      >
        <Icon name="plus-circle" /> {buttonText}
      </Button>
      <Paragraph
        type="secondary"
        style={{ textAlign: "center", marginTop: "10px" }}
      >
        <FormattedMessage
          id="project.explorer.file-listing.no-files.shift-return"
          defaultMessage={`(or <keyboard>Shift+Return</keyboard> in the search box)`}
          description={"Tell user about a keyboard shortcut."}
          values={{
            keyboard: (c) => <Text code>{c}</Text>,
          }}
        />
      </Paragraph>
      <HelpAlert
        file_search={file_search}
        actual_new_filename={actualNewFilename}
      />
      <div style={{ marginTop: "15px" }}>
        <h4 style={{ color: "#666" }}>Select a File Type</h4>
        <FileTypeSelector
          create_file={(ext) => {
            ext = ext ? ext : "ipynb";
            const filename = file_search.trim()
              ? file_search + "." + ext
              : default_filename(ext, project_id);
            actions.createFile({
              name: join(current_path ?? "", filename),
            });
          }}
          create_folder={() => {
            const filename = default_filename(undefined, project_id);
            actions.createFolder({
              name: file_search.trim()
                ? file_search
                : join(current_path ?? "", filename),
            });
          }}
          projectActions={actions}
          availableFeatures={availableFeatures}
          filename={actualNewFilename}
        />
      </div>
    </div>
  );
}
