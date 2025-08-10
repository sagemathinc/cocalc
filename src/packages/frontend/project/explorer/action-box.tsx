/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell: ignore isdir

import { Button as AntdButton, Radio, Space } from "antd";
import * as immutable from "immutable";
import { useState } from "react";
import { useIntl } from "react-intl";
import {
  Alert,
  Button,
  Checkbox,
  Col,
  Row,
  Well,
} from "@cocalc/frontend/antd-bootstrap";
import { useRedux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, LoginLink } from "@cocalc/frontend/components";
import SelectServer from "@cocalc/frontend/compute/select-server";
import ComputeServerTag from "@cocalc/frontend/compute/server-tag";
import { useRunQuota } from "@cocalc/frontend/project/settings/run-quota/hooks";
import {
  file_actions,
  type ProjectActions,
} from "@cocalc/frontend/project_store";
import { SelectProject } from "@cocalc/frontend/projects/select-project";
import ConfigureShare from "@cocalc/frontend/share/config";
import * as misc from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import DirectorySelector from "../directory-selector";
import { in_snapshot_path } from "../utils";
import CreateArchive from "./create-archive";
import Download from "./download";
import RenameFile from "./rename-file";

export const PRE_STYLE = {
  marginBottom: "15px",
  maxHeight: "80px",
  minHeight: "34px",
  fontSize: "14px",
  fontFamily: "inherit",
  color: "#555",
  backgroundColor: "#eee",
  padding: "6px 12px",
} as const;

type FileAction = undefined | keyof typeof file_actions;

interface Props {
  checked_files: immutable.Set<string>;
  file_action: FileAction;
  current_path: string;
  project_id: string;
  actions: ProjectActions;
}

export function ActionBox({
  checked_files,
  file_action,
  current_path,
  project_id,
  actions,
}: Props) {
  const intl = useIntl();
  const runQuota = useRunQuota(project_id, null);
  const get_user_type: () => string = useRedux("account", "get_user_type");
  const compute_server_id = useTypedRedux({ project_id }, "compute_server_id");

  const [copy_destination_directory, set_copy_destination_directory] =
    useState<string>("");
  const [copy_destination_project_id, set_copy_destination_project_id] =
    useState<string>(project_id);
  const [copy_from_compute_server_to, set_copy_from_compute_server_to] =
    useState<"compute-server" | "project">("compute-server");
  const [move_destination, set_move_destination] = useState<string>("");
  const [show_different_project, set_show_different_project] =
    useState<boolean>(false);
  const [overwrite_newer, set_overwrite_newer] = useState<boolean>();
  const [delete_extra_files, set_delete_extra_files] = useState<boolean>();
  const [dest_compute_server_id, set_dest_compute_server_id] = useState<number>(
    compute_server_id ?? 0,
  );

  function clear() {
    actions.set_all_files_unchecked();
    setTimeout(() => {
      actions.set_file_action();
    }, 1);
  }

  function cancel_action(): void {
    clear();
  }

  function action_key(e): void {
    switch (e.keyCode) {
      case 27:
        cancel_action();
        break;
      case 13:
        switch (file_action) {
          case "move":
            submit_action_move();
            break;
          case "copy":
            submit_action_copy();
            break;
        }
    }
  }

  function render_selected_files_list() {
    return (
      <pre style={PRE_STYLE}>
        {checked_files.toArray().map((name) => (
          <div key={name}>{misc.path_split(name).tail}</div>
        ))}
      </pre>
    );
  }

  function delete_click(): void {
    const paths = checked_files.toArray();
    for (const path of paths) {
      actions.close_tab(path);
    }
    actions.deleteFiles({ paths });
    clear();
  }

  function render_delete_warning() {
    if (current_path === ".trash") {
      return (
        <Col sm={5}>
          <Alert bsStyle="danger">
            <h4>
              <Icon name="exclamation-triangle" /> Notice
            </h4>
            <p>Your files have already been moved to the trash.</p>
          </Alert>
        </Col>
      );
    }
  }

  function render_delete() {
    const { size } = checked_files;
    return (
      <div>
        <Row>
          <Col sm={5} style={{ color: COLORS.GRAY_M }}>
            {render_selected_files_list()}
          </Col>
          {render_delete_warning()}
        </Row>
        <Row style={{ marginBottom: "10px" }}>
          <Col sm={12}>
            Deleting a file immediately deletes it from the disk{" "}
            {compute_server_id ? <>on the compute server</> : <></>} freeing up
            space.
            {!compute_server_id && (
              <div>
                Older backups of your files may still be available in the{" "}
                <a
                  href=""
                  onClick={(e) => {
                    e.preventDefault();
                    actions.open_directory(".snapshots");
                  }}
                >
                  ~/.snapshots
                </a>{" "}
                directory.
              </div>
            )}
          </Col>
        </Row>
        <Row>
          <Col sm={12}>
            <Space>
              <AntdButton onClick={cancel_action}>Cancel</AntdButton>
              <AntdButton
                danger
                onClick={delete_click}
                disabled={current_path === ".trash"}
              >
                <Icon name="trash" /> Delete {size} {misc.plural(size, "Item")}
              </AntdButton>
            </Space>
          </Col>
        </Row>
      </div>
    );
  }

  function move_click(): void {
    actions.moveFiles({
      src: checked_files.toArray(),
      dest: move_destination,
    });
    clear();
  }

  function valid_move_input(): boolean {
    const src_path = misc.path_split(checked_files.first()).head;
    let dest = move_destination.trim();
    if (dest === src_path) {
      return false;
    }
    if (misc.contains(dest, "//") || misc.startswith(dest, "/")) {
      return false;
    }
    if (dest.charAt(dest.length - 1) === "/") {
      dest = dest.slice(0, dest.length - 1);
    }
    return dest !== current_path;
  }

  function render_move() {
    const { size } = checked_files;
    return (
      <div>
        <Row>
          <Col sm={5} style={{ color: COLORS.GRAY_M }}>
            <h4>Move files to a directory</h4>
            {render_selected_files_list()}
            <Space>
              <Button onClick={cancel_action}>Cancel</Button>
              <AntdButton
                type="primary"
                onClick={move_click}
                disabled={!valid_move_input()}
              >
                Move {size} {misc.plural(size, "Item")}
              </AntdButton>
            </Space>
          </Col>
          <Col sm={5} style={{ color: COLORS.GRAY_M, marginBottom: "15px" }}>
            <h4>
              Destination:{" "}
              {move_destination == "" ? "Home directory" : move_destination}
            </h4>
            <DirectorySelector
              title="Select Move Destination Folder"
              key="move_destination"
              onSelect={(move_destination: string) =>
                set_move_destination(move_destination)
              }
              project_id={project_id}
              startingPath={current_path}
              isExcluded={(path) => checked_files.has(path)}
              style={{ width: "100%" }}
              bodyStyle={{ maxHeight: "250px" }}
            />
          </Col>
        </Row>
      </div>
    );
  }

  function submit_action_move(): void {
    if (valid_move_input()) {
      move_click();
    }
  }

  function render_different_project_dialog() {
    if (show_different_project) {
      return (
        <Col sm={4} style={{ color: COLORS.GRAY_M, marginBottom: "15px" }}>
          <h4>Target Project</h4>
          <SelectProject
            at_top={[project_id]}
            value={copy_destination_project_id}
            onChange={(copy_destination_project_id) =>
              set_copy_destination_project_id(copy_destination_project_id)
            }
          />
          {render_copy_different_project_options()}
        </Col>
      );
    }
  }

  function render_copy_different_project_options() {
    if (project_id !== copy_destination_project_id) {
      return (
        <div>
          <Checkbox
            onChange={(e) => set_delete_extra_files((e.target as any).checked)}
          >
            Delete extra files in target directory
          </Checkbox>
          <Checkbox
            onChange={(e) => set_overwrite_newer((e.target as any).checked)}
          >
            Overwrite newer versions of files
          </Checkbox>
        </div>
      );
    }
  }

  function getDestinationComputeServerId() {
    return copy_from_compute_server_to == "compute-server"
      ? compute_server_id
      : 0;
  }

  function copy_click(): void {
    const destination_project_id = copy_destination_project_id;
    const destination_directory = copy_destination_directory;
    const paths = checked_files.toArray();
    if (
      destination_project_id != undefined &&
      project_id !== destination_project_id
    ) {
      actions.copy_paths_between_projects({
        public: false,
        src_project_id: project_id,
        src: paths,
        target_project_id: destination_project_id,
        target_path: destination_directory,
        overwrite_newer,
        delete_missing: delete_extra_files,
      });
    } else {
      if (compute_server_id) {
        actions.copyPaths({
          src: paths,
          dest: destination_directory,
          src_compute_server_id: compute_server_id,
          dest_compute_server_id: getDestinationComputeServerId(),
        });
      } else {
        actions.copyPaths({
          src: paths,
          dest: destination_directory,
          src_compute_server_id: 0,
          dest_compute_server_id: dest_compute_server_id,
        });
      }
    }

    clear();
  }

  function valid_copy_input(): boolean {
    const src_path = misc.path_split(checked_files.first()).head;
    const input = copy_destination_directory;

    const src_compute_server_id = compute_server_id ?? 0;
    const dest_compute_server_id = getDestinationComputeServerId();

    if (
      input === src_path &&
      project_id === copy_destination_project_id &&
      src_compute_server_id == dest_compute_server_id
    ) {
      return false;
    }
    if (copy_destination_project_id === "") {
      return false;
    }
    if (
      input === current_path &&
      project_id === copy_destination_project_id &&
      src_compute_server_id == dest_compute_server_id
    ) {
      return false;
    }
    if (misc.startswith(input, "/")) {
      return false;
    }
    return true;
  }

  function render_copy_description() {
    for (const path of checked_files) {
      if (in_snapshot_path(path)) {
        return (
          <>
            <h4>Restore files from backup</h4>
            {render_selected_files_list()}
          </>
        );
      }
    }
    return (
      <>
        {!compute_server_id ? (
          <div style={{ display: "flex" }}>
            <h4>Items </h4>

            <div style={{ flex: 1, textAlign: "right" }}>
              <AntdButton
                onClick={() => {
                  const show = !show_different_project;
                  set_show_different_project(show);
                  if (show_different_project) {
                    set_dest_compute_server_id(0);
                  }
                }}
              >
                {show_different_project
                  ? "Copy to this project..."
                  : "Copy to a different project..."}
              </AntdButton>
            </div>
          </div>
        ) : (
          <h4>
            <div style={{ display: "inline-block", marginRight: "15px" }}>
              Copy to{" "}
            </div>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              value={copy_from_compute_server_to}
              onChange={(e) => {
                set_copy_from_compute_server_to(e.target.value);
              }}
              options={[
                { label: "Compute Server", value: "compute-server" },
                { label: "Home Base", value: "project" },
              ]}
            />
          </h4>
        )}
        <div>{render_selected_files_list()}</div>
      </>
    );
  }

  function render_copy() {
    const { size } = checked_files;
    const signed_in = get_user_type() === "signed_in";
    if (!signed_in) {
      return (
        <div>
          <LoginLink />
          <Row>
            <Col sm={12}>
              <Space>
                <Button onClick={cancel_action}>Cancel</Button>
                <Button bsStyle="primary" disabled={true}>
                  <Icon name="files" /> Copy {size} {misc.plural(size, "item")}
                </Button>
              </Space>
            </Col>
          </Row>
        </div>
      );
    } else {
      return (
        <div>
          <Row>
            <Col
              sm={show_different_project ? 4 : 5}
              style={{ color: COLORS.GRAY_M }}
            >
              {render_copy_description()}
              <Space>
                <AntdButton onClick={cancel_action}>Cancel</AntdButton>
                <AntdButton
                  type="primary"
                  onClick={copy_click}
                  disabled={!valid_copy_input()}
                >
                  <Icon name="files" /> Copy {size} {misc.plural(size, "Item")}
                </AntdButton>
              </Space>
            </Col>
            {render_different_project_dialog()}
            <Col
              sm={show_different_project ? 4 : 5}
              style={{ color: COLORS.GRAY_M }}
            >
              <h4
                style={
                  !show_different_project ? { minHeight: "25px" } : undefined
                }
              >
                Destination:{" "}
                {copy_destination_directory == ""
                  ? "Home Directory"
                  : copy_destination_directory}
              </h4>
              <DirectorySelector
                title={
                  compute_server_id ? (
                    `Destination ${
                      copy_from_compute_server_to == "compute-server"
                        ? "on the Compute Server"
                        : "in the Home Base"
                    }`
                  ) : (
                    <div style={{ display: "flex" }}>
                      Destination{" "}
                      {compute_server_id == 0 && !show_different_project && (
                        <div style={{ flex: 1, textAlign: "right" }}>
                          <SelectServer
                            fullLabel
                            project_id={project_id}
                            value={dest_compute_server_id}
                            setValue={(dest_compute_server_id) =>
                              set_dest_compute_server_id(dest_compute_server_id)
                            }
                          />
                        </div>
                      )}
                    </div>
                  )
                }
                onSelect={(value: string) =>
                  set_copy_destination_directory(value)
                }
                key="copy_destination_directory"
                startingPath={current_path}
                project_id={copy_destination_project_id}
                style={{ width: "100%" }}
                bodyStyle={{ maxHeight: "250px" }}
                compute_server_id={
                  compute_server_id
                    ? copy_from_compute_server_to == "compute-server"
                      ? compute_server_id
                      : 0
                    : dest_compute_server_id
                }
              />
            </Col>
          </Row>
        </div>
      );
    }
  }

  function submit_action_copy(): void {
    if (valid_copy_input()) {
      copy_click();
    }
  }

  function render_share() {
    // currently only works for a single selected file
    const path: string = checked_files.first() ?? "";
    if (!path) {
      return null;
    }
    return (
      <ConfigureShare
        project_id={project_id}
        path={path}
        compute_server_id={compute_server_id}
        close={cancel_action}
        onKeyUp={action_key}
        actions={actions}
        has_network_access={!!runQuota.network}
      />
    );
  }

  function render_action_box(action: FileAction) {
    switch (action) {
      case "compress":
        return <CreateArchive clear={clear} />;
      case "copy":
        return render_copy();
      case "delete":
        return render_delete();
      case "download":
        return <Download clear={clear} />;
      case "rename":
        return <RenameFile clear={clear} />;
      case "duplicate":
        return <RenameFile clear={clear} duplicate />;
      case "move":
        return render_move();
      case "share":
        return render_share();
      default:
        return undefined;
    }
  }

  const action = file_action;
  const action_button = file_actions[action || "undefined"];
  if (action_button == undefined) {
    return <div>Undefined action</div>;
  }
  return (
    <Well
      style={{
        margin: "15px 30px",
        overflowY: "auto",
        maxHeight: "50vh",
        backgroundColor: "#fafafa",
      }}
    >
      <Row>
        <Col
          sm={12}
          style={{
            color: COLORS.GRAY_M,
            fontWeight: "bold",
            fontSize: "15pt",
          }}
        >
          <Icon name={action_button.icon ?? "exclamation-circle"} />{" "}
          {intl.formatMessage(action_button.name)}
          <div style={{ float: "right" }}>
            <AntdButton onClick={cancel_action} type="text">
              <Icon name="times" />
            </AntdButton>
          </div>
          {!!compute_server_id && (
            <ComputeServerTag
              id={compute_server_id}
              style={{ float: "right", top: "5px" }}
            />
          )}
        </Col>
        <Col sm={12}>{render_action_box(action)}</Col>
      </Row>
    </Well>
  );
}
