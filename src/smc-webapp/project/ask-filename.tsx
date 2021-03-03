/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";
const { file_options } = require("../editor");
const {
  Col,
  Row,
  ButtonToolbar,
  ControlLabel,
  Button,
  Form,
} = require("react-bootstrap");
import { SearchInput, SelectorInput, Icon } from "../r_misc";
const { IS_TOUCH } = require("../feature");
import { NewFilenameFamilies, NewFilenames } from "smc-webapp/project/utils";
import { FileSpec } from "../file-associations";
import { NEW_FILENAMES } from "smc-util/db-schema";

interface Props {
  actions: any;
  ext_selection: string; // if it is '/' then make a folder instead
  current_path: string;
  new_filename?: string;
  other_settings: any;
}

export const AskNewFilename: React.FC<Props> = (props: Props) => {
  const {
    actions,
    ext_selection,
    current_path,
    new_filename,
    other_settings,
  } = props;

  const rfn = other_settings.get(NEW_FILENAMES);
  const selected = rfn != null ? rfn : NewFilenames.default_family;

  React.useEffect(() => {
    shuffle();
  }, [rfn]);

  function cancel(): void {
    actions.ask_filename(undefined);
  }

  function shuffle(): void {
    actions.ask_filename(ext_selection);
  }

  function create(name, focus): void {
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
  }

  function submit(val: string, opts: any): void {
    create(val, !opts.ctrl_down);
  }

  function create_click(): void {
    create(new_filename, true);
  }

  function change(val: string): void {
    actions.setState({ new_filename: val });
  }

  function filename(): string {
    const data: FileSpec = file_options(`foo.${ext_selection}`);
    return data.name;
  }

  function change_family(family: string): void {
    actions.set_new_filename_family(family);
  }

  if (new_filename == null) return <div>Loading …</div>;

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
            <Col md={5}>
              <SelectorInput
                selected={selected}
                options={NewFilenameFamilies}
                on_change={change_family}
              />
            </Col>

            <Col md={7}>
              <ButtonToolbar style={{ whiteSpace: "nowrap", padding: "0" }}>
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
};
