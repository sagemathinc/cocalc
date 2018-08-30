import * as immutable from "immutable";
import { React, Component } from "../app-framework";

const { alert_message } = require("../alerts");
const { COLORS } = require("smc-util/theme");
const {
  COMPUTE_IMAGES,
  DEFAULT_COMPUTE_IMAGE
} = require("smc-util/compute-images");
const IMMUTABLE_COMPUTE_IMAGES = immutable.fromJS(COMPUTE_IMAGES); // only because that's how all the ui code was written.

const { Alert, Button, DropdownButton, MenuItem } = require("react-bootstrap");
const { Icon, Loading, Space } = require("../r_misc");

interface ReactProps {
  save_compute_image: (name: string) => Promise<void>;
  active_compute_image: string;
}

interface StateTypes {
  displayed_compute_image: string;
  compute_image_changing: boolean;
  compute_image_focused: boolean;
}

export class ComputeImageSelector extends Component<ReactProps, StateTypes> {
  constructor(props: ReactProps) {
    super(props);
    this.state = {
      displayed_compute_image: props.active_compute_image,
      compute_image_changing: false,
      compute_image_focused: false
    };
  }
  componentWillReceiveProps(props: ReactProps) {
    if (this.state.compute_image_focused) {
      return;
    }
    const new_image = props.active_compute_image;
    if (new_image !== this.state.displayed_compute_image) {
      this.setState({
        displayed_compute_image: new_image,
        compute_image_changing: false
      });
    }
  }

  cancel_compute_image(current_image) {
    this.setState({
      displayed_compute_image: current_image,
      compute_image_changing: false,
      compute_image_focused: false
    });
  }

  async save_compute_image(current_image) {
    // image is reset to the previous name and componentWillReceiveProps will set it when new
    this.setState({
      displayed_compute_image: current_image,
      compute_image_changing: true,
      compute_image_focused: false
    });
    const new_image = this.state.displayed_compute_image;
    try {
      await this.props.save_compute_image(new_image);
    } catch (err) {
      if (err && err.message) {
        alert_message({ type: "error", message: err.message });
      }
      this.setState({ compute_image_changing: false });
    }
  }

  set_compute_image = name => {
    this.setState({ displayed_compute_image: name });
  };

  compute_image_info(name, type) {
    return IMMUTABLE_COMPUTE_IMAGES.getIn([name, type]);
  }

  render_compute_image_items() {
    return IMMUTABLE_COMPUTE_IMAGES.entrySeq().map(entry => {
      const [name, data] = entry;
      return (
        <MenuItem key={name} eventKey={name} onSelect={this.set_compute_image}>
          {data.get("title")}
        </MenuItem>
      );
    });
  }

  render_select_compute_image_error() {
    const err = IMMUTABLE_COMPUTE_IMAGES.get("error");
    return (
      <Alert bsStyle="warning" style={{ margin: "10px" }}>
        <h4>Problem loading compute images</h4>
        <code>{err}</code>
      </Alert>
    );
  }

  render() {
    const no_value = this.state.displayed_compute_image == null;
    if (no_value || this.state.compute_image_changing) {
      return <Loading />;
    }
    if (IMMUTABLE_COMPUTE_IMAGES.has("error")) {
      return this.render_select_compute_image_error();
    }
    // this will at least return a suitable default value
    const selected_image = this.state.displayed_compute_image;
    const current_image = this.props.active_compute_image;
    const default_title = this.compute_image_info(
      DEFAULT_COMPUTE_IMAGE,
      "title"
    );

    return (
      <div style={{ color: "#666" }}>
        <div style={{ fontSize: "12pt" }}>
          <Icon name={"hdd"} />
          <Space />
          Selected image
          <Space />
          <DropdownButton
            title={this.compute_image_info(selected_image, "title")}
            id={selected_image}
            onToggle={open => this.setState({ compute_image_focused: open })}
            onBlur={() => this.setState({ compute_image_focused: false })}
          >
            {this.render_compute_image_items()}
          </DropdownButton>
          <Space />
          {selected_image !== DEFAULT_COMPUTE_IMAGE ? (
            <span style={{ color: COLORS.GRAY, fontSize: "11pt" }}>
              <br /> (If in doubt, select "{default_title}
              ".)
            </span>
          ) : (
            undefined
          )}
        </div>
        <div style={{ marginTop: "10px" }}>
          <span>
            <i>{this.compute_image_info(selected_image, "descr")}</i>
          </span>
        </div>
        {selected_image !== current_image ? (
          <div style={{ marginTop: "10px" }}>
            <Button
              onClick={() => this.save_compute_image(current_image)}
              bsStyle="warning"
            >
              Save and Restart
            </Button>
            <Space />
            <Button onClick={() => this.cancel_compute_image(current_image)}>
              Cancel
            </Button>
          </div>
        ) : (
          undefined
        )}
      </div>
    );
  }
}
