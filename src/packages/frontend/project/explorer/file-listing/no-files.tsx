/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button } from "antd";
import { useMemo } from "react";
import { Paragraph, Text } from "@cocalc/frontend/components";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { FileTypeSelector } from "@cocalc/frontend/project/new";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { MainConfiguration } from "@cocalc/frontend/project_configuration";
import { useAvailableFeatures } from "@cocalc/frontend/project/use-available-features";
import { HelpAlert } from "./help-alert";
import { full_path_text } from "./utils";
import ComputeServer from "@cocalc/frontend/compute/inline";

interface Props {
  name: string;
  actions: ProjectActions;
  create_folder: () => void;
  create_file: () => void;
  file_search: string;
  current_path?: string;
  project_id: string;
  configuration_main?: MainConfiguration;
}

export default function NoFiles({
  actions,
  create_folder,
  create_file,
  file_search = "",
  project_id,
  configuration_main,
}: Props) {
  const availableFeatures = useAvailableFeatures(project_id);
  const compute_server_id = useTypedRedux({ project_id }, "compute_server_id");
  const { buttonText, actualNewFilename } = useMemo(() => {
    const actualNewFilename =
      file_search.length === 0
        ? ""
        : full_path_text(file_search, configuration_main?.disabled_ext ?? []);

    const buttonText =
      file_search.length === 0 ? (
        "Create or Upload Files..."
      ) : (
        <>
          Create {actualNewFilename}{" "}
          {!!compute_server_id && (
            <>
              {" on "}
              <ComputeServer id={compute_server_id} />
            </>
          )}
        </>
      );
    return { buttonText, actualNewFilename };
  }, [file_search.length, compute_server_id]);

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
      <h4 style={{ color: "#666" }}>
        No files {file_search?.trim() ? `matching '${file_search}'` : ""} found
      </h4>
      <hr />
      <Button
        size="large"
        type="primary"
        style={{
          margin: "0 auto",
          height: "80px",
          fontSize: "24px",
        }}
        onClick={(): void => {
          if (file_search.length === 0) {
            actions.set_active_tab("new");
          } else if (file_search[file_search.length - 1] === "/") {
            create_folder();
          } else {
            create_file();
          }
        }}
      >
        <Icon name="plus-circle" /> {buttonText}
      </Button>
      <Paragraph
        type="secondary"
        style={{ textAlign: "center", marginTop: "10px" }}
      >
        (or <Text code>Shift+Return</Text> in the search box)
      </Paragraph>
      <HelpAlert
        file_search={file_search}
        actual_new_filename={actualNewFilename}
      />
      {file_search.length > 0 && (
        <div style={{ marginTop: "15px" }}>
          <h4 style={{ color: "#666" }}>Or Select a File Type</h4>
          <FileTypeSelector
            create_file={create_file}
            create_folder={create_folder}
            projectActions={actions}
            availableFeatures={availableFeatures}
            filename={actualNewFilename}
          />
        </div>
      )}
    </div>
  );
}
