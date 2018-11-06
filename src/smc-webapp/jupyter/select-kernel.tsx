/*
help users selecting a kernel
*/

import { React, Component, Rendered } from "../app-framework"; // TODO: this will move
import {
  Map as ImmutableMap,
  OrderedMap /*, List as ImmutableList*/
} from "immutable";
// import { Kernels } from "./util";
const { Icon, Markdown } = require("../r_misc"); // TODO: import types
const {
  Button,
  Col,
  Row,
  MenuItem,
  DropdownButton
} = require("react-bootstrap"); // TODO: import types

interface IKernelSelectorProps {
  actions: any;
  kernel?: string;
  default_kernel?: string;
  kernel_selection?: ImmutableMap<string, string>;
  kernels_by_name?: OrderedMap<string, ImmutableMap<string, string>>;
}

interface IKernelSelectorState {
  selected_kernel?: string;
}

export class KernelSelector extends Component<
  IKernelSelectorProps,
  IKernelSelectorState
> {
  constructor(props: IKernelSelectorProps, context: any) {
    super(props, context);
    this.state = { selected_kernel: undefined };
  }

  close = () => {
    this.props.actions.close_select_kernel();
    this.props.actions.focus(true);
  };

  render_title_icon() {
    return undefined;
  }

  render_select_button() {
    const disabled = this.state.selected_kernel == null;
    const msg = disabled
      ? "Select a kernel"
      : `Use ${this.kernel_name(this.state.selected_kernel!)}`;
    return (
      <Button
        key={"select"}
        bsStyle={disabled ? "default" : "primary"}
        disabled={disabled}
        onClick={() =>
          this.props.actions.select_kernel(this.state.selected_kernel)
        }
      >
        {msg}
      </Button>
    );
  }

  close_button() {
    return (
      <Button
        key={"close"}
        bsStyle={"default"}
        onClick={() => this.props.actions.select_kernel(null)}
      >
        {"View without kernel"}
      </Button>
    );
  }

  render_body() {
    if (this.props.kernel_selection == null) return;
    let ks = this.props.kernel_selection.map((k, v) => {
      return `${k}=${v}`;
    });
    return <Markdown value={`kernels: ${ks.join(", ")}`} />;
  }

  kernel_name(name: string): string {
    if (this.props.kernels_by_name == null) return "";
    const k = this.props.kernels_by_name.get(name);
    if (k == null) return "";
    return k.get("display_name", name);
  }

  render_suggested() {
    return (
      <>
        <h4>Suggested kernels</h4>
        <Col md={4}>
          <Row>
            <Button onClick={() => this.props.actions.select_kernel("python3")}>
              <Icon name={"cc-icon-python"} /> {this.kernel_name("python3")}
            </Button>
          </Row>
        </Col>
      </>
    );
  }

  render_all() {
    if (this.props.kernels_by_name == null) return;
    const all: Rendered[] = [];
    this.props.kernels_by_name.mapKeys(name => {
      if (name == null) return;
      all.push(
        <MenuItem
          key={`kernel-${name}`}
          eventKey={name}
          onSelect={name => this.setState({ selected_kernel: name })}
        >
          {this.kernel_name(name)}
        </MenuItem>
      );
    });

    return (
      <>
        <h4>All kernels</h4>
        <DropdownButton id={"Select kernel"} title={"select kernel"}>
          {all}
        </DropdownButton>
      </>
    );
  }

  render_last() {
    if (this.props.default_kernel == null) return;
    return (
      <>
        <h4>Quick selection</h4>
        <div>
          Your most recently selected kernel was:{" "}
          <Button
            onClick={() =>
              this.props.actions.select_kernel(this.props.default_kernel)
            }
          >
            {this.kernel_name(this.props.default_kernel)}
          </Button>
        </div>
      </>
    );
  }

  render_top() {
    if (this.props.kernel == null) {
      return (
        <>
          <strong>This notebook has no kernel set.</strong> A kernel is required
          in order to evaluate the code in the notebook. Based on the
          programming language you want to work with, you have to select one.
          (Otherwise you can only view it.)
        </>
      );
    } else {
      return (
        <>
          Select a new kernel. (Currently selected: "
          {this.kernel_name(this.props.kernel)}
          ")
        </>
      );
    }
  }

  render() {
    if (this.props.kernel_selection == null) return;

    const style: React.CSSProperties = {
      padding: "20px 40px",
      overflowY: "auto",
      overflowX: "hidden",
      height: "90%"
    };

    return (
      <Col style={style} md={6} mdOffset={3}>
        <Row>
          <h3>
            {this.render_title_icon()}
            {"Select a Kernel"}
          </h3>
        </Row>
        <Row>{this.render_top()}</Row>
        <Row>{this.render_last()}</Row>
        <Row>{this.render_suggested()}</Row>
        <Row>{this.render_all()}</Row>

        <Row>
          {this.close_button()} {this.render_select_button()}
        </Row>
      </Col>
    );
  }
}
