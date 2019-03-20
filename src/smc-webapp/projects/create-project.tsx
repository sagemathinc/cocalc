/*
Create a new project
*/
import { analytics_event } from "../tracker";

import { Component, React, ReactDOM, redux, Rendered } from "../app-framework";

const { capitalize } = require("smc-util/misc");

import {
  ComputeImages,
  ComputeImage,
  ComputeImageKeys,
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

export function id2name(id: string): string {
  return id
    .split("-")
    .map(capitalize)
    .join(" ");
}

function fallback(
  img: ComputeImage,
  key: ComputeImageKeys,
  replace: (img?: ComputeImage) => string
): string {
  const ret = img.get(key);
  if (ret == null || ret.length == 0) {
    return replace(img);
  }
  return ret;
}

export function custom_img2name(img: ComputeImage, id: string) {
  return fallback(img, "display", _ => id2name(id));
}

interface Props {
  start_in_edit_mode?: boolean;
  default_value?: string;
  images?: ComputeImages;
}

type EditState = "edit" | "view" | "saving";

interface State {
  state: EditState;
  show_advanced: boolean;
  image_type: ComputeImageTypes;
  image_selected?: string;
  title_text: string;
  // only for custom images, and troggles form true → false after first edit
  title_prefill: boolean;
  error: string;
}

const INIT_STATE: Readonly<State> = Object.freeze({
  state: "view" as EditState,
  title_text: "",
  error: "",
  show_advanced: false,
  title_prefill: true,
  image_selected: undefined,
  image_type: legacy
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

  select_image = (id: string, display: string) => {
    this.setState({ image_selected: id });
    // always overwrite the text, until the user edits it once
    if (this.state.title_prefill) {
      this.setState({ title_text: display });
    }
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
      .map((img, id) => custom_img2name(img, id))
      .sortBy(display => display.toLowerCase())
      .entrySeq()
      .map(e => {
        const [id, display] = e;
        return (
          <ListGroupItem
            key={id}
            active={this.state.image_selected === id}
            onClick={() => this.select_image(id, display)}
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
    // ATTN: deriving disp, desc, etc. must be robust against null and empty strings
    const img: ComputeImage = data;
    let disp = fallback(img, "display", _ => id2name(id));

    const desc: string = fallback(
      img,
      "desc",
      _ => "*No description available.*"
    );
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

  input_on_change = (): void => {
    const text = ReactDOM.findDOMNode(this.refs.new_project_title).value;
    this.setState({
      title_text: text,
      title_prefill: false
    });
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
      <Row>
        <Col sm={12}>
          <ControlLabel>Software environment</ControlLabel>

          <FormGroup>
            <Radio
              checked={this.state.image_type === legacy}
              id={"default-compute-image"}
              onChange={() => this.setState({ image_type: legacy })}
            >
              <b>Default</b>: large repository of software, maintained by{" "}
              <CompanyName />, running <SiteName />.{" "}
              <a
                href={`${window.app_base_url}/doc/software.html`}
                target={"_blank"}
              >
                More details...
              </a>
            </Radio>

            {this.props.images != null && this.props.images.size > 0 ? (
              <Radio
                checked={this.state.image_type === custom}
                label={"Custom software environment"}
                id={"custom-compute-image"}
                onChange={() => this.setState({ image_type: custom })}
              >
                <b>Custom</b>: 3rd party software environments, e.g.{" "}
                <a href={"https://mybinder.org/"} target={"_blank"}>
                  MyBinder
                </a>
              </Radio>
            ) : (
              "There are no customized compute images available."
            )}
          </FormGroup>
        </Col>

        <Col sm={6}>{this.render_custom_images()}</Col>
        <Col sm={6}>{this.render_selected_custom_image_info()}</Col>
      </Row>
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
            <div>
              <a
                onClick={() => this.setState({ show_advanced: true })}
                style={{ cursor: "pointer" }}
              >
                Advanced ...
              </a>
            </div>
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

require("compute-images/init");
