/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useEffect } from "react";
import { file_options } from "@cocalc/frontend/editor-tmp";
import {
  Col,
  Row,
  ButtonToolbar,
  ControlLabel,
  Button,
  Form,
} from "@cocalc/frontend/antd-bootstrap";
import {
  SearchInput,
  SelectorInput,
  Icon,
  Loading,
} from "@cocalc/frontend/components";
import { IS_TOUCH } from "@cocalc/frontend/feature";
import {
  NewFilenameFamilies,
  NewFilenames,
} from "@cocalc/frontend/project/utils";
import { FileSpec } from "../file-associations";
import { NEW_FILENAMES } from "@cocalc/util/db-schema";
import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";

interface Props {
  project_id: string;
}

export default function AskNewFilename({ project_id }: Props) {
  const actions = useActions({ project_id });
  const ext_selection = useTypedRedux({ project_id }, "ext_selection");
  const current_path = useTypedRedux({ project_id }, "current_path");
  const other_settings = useTypedRedux("account", "other_settings");
  const new_filename = useTypedRedux({ project_id }, "new_filename");
  const rfn = other_settings.get(NEW_FILENAMES);
  const selected = rfn != null ? rfn : NewFilenames.default_family;

  useEffect(() => {
    shuffle();
  }, [rfn]);

  if (actions == null || new_filename == null) {
    return <Loading />;
  }

  const cancel = () => {
    actions.ask_filename(undefined);
  };

  const shuffle = () => {
    actions.ask_filename(ext_selection);
  };

  const create = (name, focus) => {
    actions.ask_filename(undefined);
    if (ext_selection == "/") {
      actions.create_folder({
        name: name,
        current_path: current_path,
        switch_over: focus,
      });
    } else {
      actions.create_file({
        name: name,
        ext: ext_selection,
        current_path: current_path,
        switch_over: focus,
      });
    }
  };

  const submit = (val: string, opts: any) => {
    create(val, !opts.ctrl_down);
  };

  const create_click = () => {
    create(new_filename, true);
  };

  const change = (val: string) => {
    actions.setState({ new_filename: val });
  };

  const filename = () => {
    const data: FileSpec = file_options(`foo.${ext_selection}`);
    return data.name;
  };

  const change_family = (family: string) => {
    actions.set_new_filename_family(family);
  };

  return (
    <Row style={{ marginBottom: "10px" }}>
      <Col md={6} mdOffset={0} lg={4} lgOffset={0}>
        <ControlLabel>
          Enter name for new {filename()}{" "}
          {ext_selection == "/" ? "folder" : "file"}:
        </ControlLabel>
        <Form>
          <SearchInput
            autoFocus={!IS_TOUCH}
            autoSelect={!IS_TOUCH}
            value={new_filename}
            placeholder={"Enter filename..."}
            on_submit={submit}
            on_escape={cancel}
            on_change={change}
          />
          <Row>
            <Col md={5} style={{ paddingTop: "15px" }}>
              <SelectorInput
                selected={selected}
                options={NewFilenameFamilies}
                on_change={change_family}
              />
            </Col>

            <Col md={7}>
              <ButtonToolbar
                style={{
                  whiteSpace: "nowrap",
                  padding: "0",
                  marginTop: "15px",
                }}
              >
                <Button onClick={shuffle}>
                  <Icon name={"sync-alt"} />
                </Button>
                <Button
                  className={"pull-right"}
                  bsStyle={"primary"}
                  onClick={create_click}
                  disabled={new_filename.length == 0}
                >
                  <Icon name={"plus-circle"} /> Create
                </Button>
                <Button className={"pull-right"} onClick={cancel}>
                  Cancel
                </Button>
              </ButtonToolbar>
            </Col>
          </Row>
        </Form>
      </Col>
    </Row>
  );
}
