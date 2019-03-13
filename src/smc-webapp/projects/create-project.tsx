/*
Create a new project
*/
import { analytics_event } from "../tracker";

import { Component, React, ReactDOM, redux, Rendered } from "../app-framework";

import {
  ComputeImages,
  ComputeImage,
  ComputeImageTypes,
  custom_image_name
} from "../compute-images/init";

const { SiteName, CompanyName } = require("../customize");

const { Markdown } = require("../r_misc");

const {
  Row,
  Col,
  Well,
  Button,
  ButtonToolbar,
  FormControl,
  FormGroup,
  ControlLabel,
  ListGroup,
  ListGroupItem,
  Alert,
  Radio,
  ErrorDisplay
} = require("react-bootstrap");

const { Icon, Space } = require("../r_misc");

const misc = require("smc-util/misc");

const COLORS = require("smc-util/theme").COLORS;

// (hsy) hits might seem excessive, but I confused myself too often. it helped.
const legacy: ComputeImageTypes = "legacy";
const custom: ComputeImageTypes = "custom";

interface Props {
  start_in_edit_mode?: boolean;
  default_value?: string;
  images?: ComputeImages;
}

interface State {
  state: "edit" | "view" | "saving";
  image_type: ComputeImageTypes;
  image_selected?: string;
  title_text: string;
  error: string;
}

export class NewProjectCreator extends Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = {
      state: props.start_in_edit_mode ? "edit" : "view", // view --> edit --> saving --> view
      title_text: "",
      error: "",
      image_type: legacy
    };
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
    this.setState({
      state: "view",
      title_text: "",
      error: ""
    });
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
    analytics_event("create_project", "created_new_project");
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
  };

  handle_keypress = e => {
    if (e.keyCode === 27) {
      this.cancel_editing();
    } else if (e.keyCode === 13 && this.state.title_text !== "") {
      this.create_project();
    }
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

  select_image = (id: string) => {
    this.setState({ image_selected: id });
  };

  render_custom_image_entries() {
    const item_style = {
      width: "100%",
      margin: "2px 0px",
      padding: "5px",
      border: "none",
      textAlign: "left"
    };
    if (this.props.images == null) return;

    const entries: Rendered[] = this.props.images
      .filter(img => img.get("type", "") === custom)
      .sortBy((img, key) => img.get("display", key).toLowerCase())
      .entrySeq()
      .map(e => {
        const id = e[0];
        const display = e[1].get("display", id);
        return (
          <ListGroupItem
            key={id}
            active={this.state.image_selected === id}
            onClick={() => this.select_image(id)}
            style={item_style}
            bsSize={"small"}
          >
            {display}
          </ListGroupItem>
        );
      })
      .toArray();

    return <>{entries}</>;
  }

  render_custom_images() {
    if (this.state.image_type !== custom) return;

    const list_style = {
      maxHeight: "275px",
      overflowX: "hidden",
      overflowY: "scroll",
      border: `1px solid ${COLORS.GRAY_LL}`,
      borderRadius: "5px",
      marginBottom: "0px"
    };

    return (
      <ListGroup style={list_style}>
        {this.render_custom_image_entries()}
      </ListGroup>
    );
  }

  render_selected_custom_image_info() {
    if (
      this.state.image_type !== custom ||
      this.state.image_selected == null ||
      this.props.images == null
    ) {
      return;
    }

    const id: string = this.state.image_selected;
    const data = this.props.images.get(id);
    if (data == null) {
      // we have a serious problem
      console.warn(`compute_image data missing for '${id}'`);
      return;
    }
    const img: ComputeImage = data;
    const disp = img.get("display", id);
    const desc: string = img.get("desc", "*No description available.*");
    const url = img.get("url");
    const src = img.get("src");
    // show :latest if there is no tag (must match back-end heuristic!)
    const tag = id.indexOf(":") >= 0 ? "" : ":latest";

    return (
      <>
        <h3 style={{ marginTop: 0 }}>{disp}</h3>
        <div>
          image:{" "}
          <code>
            {id}
            {tag}
          </code>
        </div>
        <div>
          <Markdown value={desc} className={"cc-custom-image-desc"} />
        </div>
        {src != null ? (
          <div>
            Source: <code>{src}</code>
          </div>
        ) : (
          undefined
        )}
        {url != null ? (
          <div>
            URL: <a href={url}>further information</a>
          </div>
        ) : (
          undefined
        )}
      </>
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

  render_no_title() {
    if (this.state.title_text === "")
      return (
        <Alert bsStyle="danger">
          You have to enter a title above (you can change it later).
        </Alert>
      );
  }

  render_input_section() {
    return (
      <Well style={{ backgroundColor: "#FFF" }}>
        <Row>
          <Col sm={6}>
            <FormGroup>
              <ControlLabel>Title</ControlLabel>
              <FormControl
                ref="new_project_title"
                type="text"
                placeholder="Project title"
                disabled={this.state.state === "saving"}
                value={this.state.title_text}
                onChange={() =>
                  this.setState({
                    title_text: ReactDOM.findDOMNode(
                      this.refs.new_project_title
                    ).value
                  })
                }
                onKeyDown={this.handle_keypress}
                autoFocus
              />
            </FormGroup>
            {this.render_no_title()}
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
        <Row>
          <Col sm={12}>
            <ControlLabel>Software environment</ControlLabel>

            <FormGroup>
              <Radio
                checked={this.state.image_type === legacy}
                id={"default-compute-image"}
                onChange={() => this.setState({ image_type: legacy })}
              >
                Default:{" "}
                <a href={`${window.app_base_url}/doc/software.html`}>
                  large repository of software
                </a>
                , maintained by <CompanyName />, running <SiteName />.
              </Radio>

              {this.props.images != null && this.props.images.size > 0 ? (
                <Radio
                  checked={this.state.image_type === custom}
                  label={"Custom software environment"}
                  id={"custom-compute-image"}
                  onChange={() => this.setState({ image_type: custom })}
                >
                  Custom: 3rd party software environments
                </Radio>
              ) : (
                undefined
              )}
            </FormGroup>
          </Col>

          <Col sm={6}>{this.render_custom_images()}</Col>
          <Col sm={6}>{this.render_selected_custom_image_info()}</Col>
        </Row>
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

require("compute-images/init");
