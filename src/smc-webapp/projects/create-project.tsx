/*
Create a new project
*/
import { analytics_event } from "../tracker";

import { Component, React, ReactDOM, redux } from "../app-framework";

import {
  ComputeImages,
  ComputeImageTypes,
  custom_image_name
} from "../compute-images/init";

import { CustomSoftware } from "../compute-images/selector";

const {
  Row,
  Col,
  Well,
  Button,
  ButtonToolbar,
  FormControl,
  FormGroup,
  Alert,
  ErrorDisplay
} = require("react-bootstrap");

const { Icon, Space } = require("../r_misc");

const misc = require("smc-util/misc");

const legacy: ComputeImageTypes = "legacy";
const custom: ComputeImageTypes = "custom";

interface Props {
  start_in_edit_mode?: boolean;
  default_value?: string;
  images?: ComputeImages;
}

type EditState = "edit" | "view" | "saving";

interface State {
  state: EditState;
  show_advanced: boolean;
  title_text: string;
  error: string;
  image_type: ComputeImageTypes;
  image_selected?: string;
  // toggles form true → false after first edit
  title_prefill: boolean;
}

const INIT_STATE: Readonly<State> = Object.freeze({
  state: "view" as EditState,
  title_text: "",
  error: "",
  show_advanced: false,
  image_selected: undefined,
  image_type: legacy,
  title_prefill: true
});

export class NewProjectCreator extends Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = Object.assign({}, INIT_STATE, {
      // view --> edit --> saving --> view
      state: props.start_in_edit_mode ? "edit" : "view"
    });
  }

  start_editing() {
    this.setState({
      state: "edit",
      title_text: this.props.default_value ? this.props.default_value : ""
    });
    // We also update the customer billing information; this is important since
    // we will call apply_default_upgrades in a moment, and it will be more
    // accurate with the latest billing information recently loaded.
    const billing_actions = redux.getActions("billing");
    if (billing_actions != undefined) {
      billing_actions.update_customer();
    }
  }

  cancel_editing = () => {
    this.setState(Object.assign({}, INIT_STATE, { state: "view" }));
  };

  toggle_editing = () => {
    if (this.state.state === "view") {
      this.start_editing();
    } else {
      this.cancel_editing();
    }
  };

  create_project = () => {
    const token = misc.uuid();
    this.setState({ state: "saving" });
    const actions = redux.getActions("projects");
    const compute_image: string =
      this.state.image_type == custom && this.state.image_selected != null
        ? custom_image_name(this.state.image_selected)
        : "default";
    actions.create_project({
      title: this.state.title_text,
      image: compute_image,
      token
    });
    redux
      .getStore("projects")
      .wait_until_project_created(token, 30, (err, project_id) => {
        if (err != undefined) {
          this.setState({
            state: "edit",
            error: `Error creating project -- ${err}`
          });
        } else {
          actions.apply_default_upgrades({ project_id });
          actions.set_add_collab(project_id, true);
          actions.open_project({ project_id, switch_to: false });
          this.cancel_editing();
        }
      });
    analytics_event("create_project", "created_new_project");
  };

  render_info_alert() {
    if (this.state.state === "saving") {
      return (
        <div style={{ marginTop: "30px" }}>
          <Alert bsStyle="info">
            <Icon name="cc-icon-cocalc-ring" spin />
            <Space /> Creating project...
          </Alert>
        </div>
      );
    }
  }

  render_error() {
    if (this.state.error) {
      return (
        <div style={{ marginTop: "30px" }}>
          <ErrorDisplay
            error={this.state.error}
            onClose={() => this.setState({ error: "" })}
          />
        </div>
      );
    }
  }

  render_new_project_button() {
    return (
      <Row>
        <Col sm={4}>
          <Button
            bsStyle="success"
            active={this.state.state !== "view"}
            disabled={this.state.state !== "view"}
            block
            type="submit"
            onClick={this.toggle_editing}
          >
            <Icon name="plus-circle" /> Create New Project...
          </Button>
        </Col>
      </Row>
    );
  }

  create_disabled() {
    return (
      // no name of new project
      this.state.title_text === "" ||
      // currently saving (?)
      this.state.state === "saving" ||
      // user wants a custom image, but hasn't selected one yet
      (this.state.image_type === custom && this.state.image_selected == null)
    );
  }

  set_title = (text: string) => {
    this.setState({ title_text: text, title_prefill: false });
  };

  input_on_change = (): void => {
    const text = ReactDOM.findDOMNode(this.refs.new_project_title).value;
    this.set_title(text);
  };

  handle_keypress = e => {
    if (e.keyCode === 27) {
      this.cancel_editing();
    } else if (e.keyCode === 13 && this.state.title_text !== "") {
      this.create_project();
    }
  };

  render_advanced() {
    if (!this.state.show_advanced) return;
    return (
      <CustomSoftware
        setParentState={obj => this.setState(obj)}
        images={this.props.images}
        image_selected={this.state.image_selected}
        image_type={this.state.image_type}
        title_prefill={this.state.title_prefill}
      />
    );
  }

  render_advanced_toggle() {
    if (this.state.show_advanced) return;
    return (
      <div>
        <a
          onClick={() => this.setState({ show_advanced: true })}
          style={{ cursor: "pointer" }}
        >
          Advanced ...
        </a>
      </div>
    );
  }

  render_input_section() {
    return (
      <Well style={{ backgroundColor: "#FFF" }}>
        <Row>
          <Col sm={6}>
            <FormGroup>
              <FormControl
                ref="new_project_title"
                type="text"
                placeholder="Project title"
                disabled={this.state.state === "saving"}
                value={this.state.title_text}
                onChange={this.input_on_change}
                onKeyDown={this.handle_keypress}
                autoFocus
              />
            </FormGroup>
            {this.render_advanced_toggle()}
          </Col>
          <Col sm={6}>
            <div style={{ color: "#666" }}>
              A <b>project</b> is your own, private computational workspace that
              you can share with others.
              <br />
              You can easily change the project title in project settings.
            </div>
          </Col>
        </Row>
        {this.render_advanced()}
        <Row>
          <Col sm={12} style={{ marginTop: "10px" }}>
            <ButtonToolbar>
              <Button
                disabled={this.create_disabled()}
                onClick={() => this.create_project()}
                bsStyle="success"
              >
                Create Project
              </Button>
              <Button
                disabled={this.state.state === "saving"}
                onClick={this.cancel_editing}
              >
                Cancel
              </Button>
            </ButtonToolbar>
          </Col>
        </Row>
        <Row>
          <Col sm={12}>
            {this.render_error()}
            {this.render_info_alert()}
          </Col>
        </Row>
      </Well>
    );
  }

  render_project_creation() {
    return (
      <Row>
        <Col sm={12}>
          <Space />
          {this.render_input_section()}
        </Col>
      </Row>
    );
  }

  render() {
    return (
      <div>
        {this.render_new_project_button()}
        {this.state.state !== "view"
          ? this.render_project_creation()
          : undefined}
      </div>
    );
  }
}
