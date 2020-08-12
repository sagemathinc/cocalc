/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Component, React, /* ReactDOM,*/ Rendered } from "../app-framework";
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

interface State {}

export class AskNewFilename extends Component<Props, State> {
  private searchRef: React.RefObject<HTMLInputElement>;

  constructor(props) {
    super(props);
    this.searchRef = React.createRef<HTMLInputElement>();
  }

  componentWillReceiveProps(next): void {
    const curr_rfn = this.props.other_settings.get(NEW_FILENAMES);
    const next_rfn = next.other_settings.get(NEW_FILENAMES);
    if (curr_rfn != next_rfn) {
      this.shuffle();
    }
  }

  cancel = (): void => {
    this.props.actions.ask_filename(undefined);
  };

  shuffle = (): void => {
    this.props.actions.ask_filename(this.props.ext_selection);
    // TODO somehow focus & select the new text in the box
    //const el = this.searchRef.current;
    //if (el != null) {
    //  ReactDOM.findDOMNode(el.refs.input).select();
    //}
  };

  create = (name, focus): void => {
    this.props.actions.ask_filename(undefined);
    if (this.props.ext_selection == "/") {
      this.props.actions.create_folder({
        name: name,
        current_path: this.props.current_path,
        switch_over: focus,
      });
    } else {
      this.props.actions.create_file({
        name: name,
        ext: this.props.ext_selection,
        current_path: this.props.current_path,
        switch_over: focus,
      });
    }
  };

  submit = (val: string, opts: any): void => {
    this.create(val, !opts.ctrl_down);
  };

  create_click = (): void => {
    this.create(this.props.new_filename, true);
  };

  change = (val: string): void => {
    this.props.actions.setState({ new_filename: val });
  };

  filename(): string {
    const data: FileSpec = file_options(`foo.${this.props.ext_selection}`);
    return data.name;
  }

  change_family = (family: string): void => {
    this.props.actions.set_new_filename_family(family);
  };

  render(): Rendered {
    if (this.props.new_filename == null) return <div>Loading …</div>;
    const rfn = this.props.other_settings.get(NEW_FILENAMES);
    const selected = rfn != null ? rfn : NewFilenames.default_family;
    return (
      <Row style={{ marginBottom: "10px" }}>
        <Col md={6} mdOffset={0} lg={4} lgOffset={0}>
          <ControlLabel>
            Enter name for new {this.filename()}{" "}
            {this.props.ext_selection == "/" ? "folder" : "file"}:
          </ControlLabel>
          <Form>
            <SearchInput
              autoFocus={!IS_TOUCH}
              autoSelect={!IS_TOUCH}
              ref={this.searchRef}
              type={"text"}
              value={this.props.new_filename}
              placeholder={"Enter filename..."}
              on_submit={this.submit}
              on_escape={this.cancel}
              on_change={this.change}
            />
            <Row>
              <Col md={5}>
                <SelectorInput
                  selected={selected}
                  options={NewFilenameFamilies}
                  on_change={this.change_family}
                />
              </Col>

              <Col md={7}>
                <ButtonToolbar style={{ whiteSpace: "nowrap", padding: "0" }}>
                  <Button onClick={this.shuffle}>
                    <Icon name={"sync-alt"} />
                  </Button>
                  <Button
                    className={"pull-right"}
                    bsStyle={"primary"}
                    onClick={this.create_click}
                    disabled={this.props.new_filename.length == 0}
                  >
                    <Icon name={"plus-circle"} /> Create
                  </Button>
                  <Button className={"pull-right"} onClick={this.cancel}>
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
}
