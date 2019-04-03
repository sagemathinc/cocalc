import { Component, React, Rendered } from "../app-framework";
const { default_filename } = require("../account.coffee");
const { file_options } = require("../editor");
const {
  Col,
  Row,
  ButtonToolbar,
  ControlLabel,
  Button,
  Form
} = require("react-bootstrap");
const { SearchInput } = require("../r_misc");
const { IS_TOUCH } = require("../feature");

interface Props {
  actions: any;
  ext_selection: string;
  current_path: string;
}
interface State {
  new_name: string;
}

export class AskNewFilename extends Component<Props, State> {
  displayName = "ProjectFiles-AskNewFilename";
  constructor(props) {
    super(props);
    this.state = {
      new_name: default_filename()
    };
  }

  componentDidMount() {
    this.setState({ new_name: default_filename() });
  }

  cancel = (): void => {
    this.props.actions.setState({ ext_selection: undefined });
  };

  create = (name, focus): void => {
    this.props.actions.setState({ ext_selection: undefined });
    this.props.actions.create_file({
      name: name,
      ext: this.props.ext_selection,
      current_path: this.props.current_path,
      switch_over: focus
    });
  };

  submit = (val: string, opts: any): void => {
    this.create(val, !opts.ctrl_down);
  };

  create_click = (): void => {
    this.create(this.state.new_name, true);
  };

  change = (val: string): void => {
    this.setState({ new_name: val });
  };

  render_filename() {
    const data: any = file_options(`foo.${this.props.ext_selection}`);
    return data.name;
  }

  render(): Rendered {
    return (
      <Row>
        <Col md={6} mdOffset={0} lg={4} lgOffset={0}>
          <ControlLabel>
            Enter name for new {this.render_filename()} file:
          </ControlLabel>
          <Form>
            <SearchInput
              autoFocus={!IS_TOUCH}
              autoSelect={!IS_TOUCH}
              ref={"new_filename2"}
              key={"new_filename2"}
              type={"text"}
              value={this.state.new_name}
              placeholder={"Enter filename..."}
              on_submit={this.submit}
              on_escape={this.cancel}
              on_change={this.change}
            />
            <ButtonToolbar
              style={{ whiteSpace: "nowrap", padding: "0" }}
              className={"pull-right"}
            >
              <Button
                bsStyle={"primary"}
                onClick={this.create_click}
                disabled={this.state.new_name.length == 0}
              >
                Create
              </Button>
              <Button onClick={this.cancel}>Cancel</Button>
            </ButtonToolbar>
          </Form>
        </Col>
      </Row>
    );
  }
}
