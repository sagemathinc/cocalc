/*
help users selecting a kernel
*/

import { React, Component, Rendered } from "../app-framework"; // TODO: this will move
import {
  Map as ImmutableMap,
  OrderedMap /*, List as ImmutableList*/
} from "immutable";
// import { Kernels } from "./util";
const { Icon, Markdown, Space } = require("../r_misc"); // TODO: import types
const {
  Button,
  Col,
  Row,
  MenuItem,
  DropdownButton
} = require("react-bootstrap"); // TODO: import types

const row_style: React.CSSProperties = {
  marginTop: "5px",
  marginBottom: "5px"
};

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

  // the idea here is to not set the kernel, but still render the notebook.
  // looks like that's not easy, and well, probably incompatible with classical jupyter.

  /*
    <Row style={row_style} className={"pull-right"}>
      {this.close_button()}
    </Row>

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
  */

  render_body() {
    if (
      this.props.kernel_selection == null ||
      this.props.kernels_by_name == null
    )
      return;
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

  render_suggested_link(cocalc) {
    if (cocalc == null) return;
    const url: string | undefined = cocalc.get("url");
    const descr: string | undefined = cocalc.get("description", "");
    if (url != null) {
      return (
        <a href={url} target={"_blank"}>
          {descr}
        </a>
      );
    } else {
      return descr;
    }
  }

  render_suggested() {
    if (
      this.props.kernel_selection == null ||
      this.props.kernels_by_name == null
    )
      return;

    const entries: Rendered[] = [];
    this.props.kernel_selection
      .sort((a, b) => this.kernel_name(a).localeCompare(this.kernel_name(b)))
      .map((name, lang) => {
        const cocalc: ImmutableMap<
          string,
          any
        > = this.props.kernels_by_name!.getIn(
          [name, "metadata", "cocalc"],
          null
        );
        if (cocalc == null) return;
        const prio: number = cocalc.get("priority", 0);
        if (prio < 10) return;

        entries.push(
          <Row key={lang} style={row_style}>
            <Col sm={4}>
              <Button onClick={() => this.props.actions.select_kernel(name)}>
                <Icon name={`cc-icon-${lang}`} /> {this.kernel_name(name)}
              </Button>
            </Col>
            <Col sm={8}>
              <div>{this.render_suggested_link(cocalc)}</div>
            </Col>
          </Row>
        );
      });

    if (entries.length == 0) return;

    return (
      <>
        <h4>Suggested kernels</h4>
        <Col>{entries}</Col>
      </>
    );
  }

  render_all_selected_link() {
    if (this.props.kernels_by_name == null) return;
    const name = this.state.selected_kernel;
    if (name == null) return;
    const cocalc: ImmutableMap<string, any> = this.props.kernels_by_name.getIn(
      [name, "metadata", "cocalc"],
      null
    );
    return this.render_suggested_link(cocalc);
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
        <Space />
        {this.render_select_button()}
        <Space />
        {this.render_all_selected_link()}
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
          Select a new kernel. (Currently selected:{" "}
          <code>{this.kernel_name(this.props.kernel)}</code>)
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
        <Row style={row_style}>
          <h3>{"Select a Kernel"}</h3>
        </Row>
        <Row style={row_style}>{this.render_top()}</Row>
        <Row style={row_style}>{this.render_last()}</Row>
        <Row style={row_style}>{this.render_suggested()}</Row>
        <Row style={row_style}>{this.render_all()}</Row>
      </Col>
    );
  }
}
