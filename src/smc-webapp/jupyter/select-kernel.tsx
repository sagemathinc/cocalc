/*
help users selecting a kernel
*/

import { React, Component, Rendered } from "../app-framework"; // TODO: this will move
import {
  Map as ImmutableMap,
  List,
  OrderedMap /*, List as ImmutableList*/
} from "immutable";
import * as misc from "smc-util/misc";
const { Icon, Markdown, /*Space,*/ Loading } = require("../r_misc"); // TODO: import types
const {
  Button,
  Col,
  Row,
  ButtonGroup,
  /* MenuItem,
  DropdownButton, */
  Alert
} = require("react-bootstrap"); // TODO: import types
import { TKernel } from "./util";
const { COLORS } = require("smc-util/theme");

const row_style: React.CSSProperties = {
  marginTop: "5px",
  marginBottom: "5px"
};

const main_style: React.CSSProperties = {
  padding: "20px 40px",
  overflowY: "auto",
  overflowX: "hidden",
  height: "90%"
};

interface IKernelSelectorProps {
  actions: any;
  kernel?: string;
  kernel_info?: any;
  default_kernel?: string;
  kernel_selection?: ImmutableMap<string, string>;
  kernels_by_name?: OrderedMap<string, ImmutableMap<string, string>>;
  kernels_by_language?: OrderedMap<string, List<string>>;
  closestKernel?: TKernel;
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

  kernel_name(name: string) {
    return this.kernel_attr(name, "display_name");
  }

  kernel_attr(name: string, attr: string): string {
    if (this.props.kernels_by_name == null) return "";
    const k = this.props.kernels_by_name.get(name);
    if (k == null) return "";
    return k.get(attr, name);
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

  render_kernel_button(
    name: string,
    size: string = "default",
    show_icon: boolean = true
  ): Rendered {
    const lang = this.kernel_attr(name, "language");
    let icon: Rendered | undefined = undefined;
    if (lang != null && show_icon) {
      if (["python", "r", "sagemath", "octave", "julia"].indexOf(lang) >= 0) {
        icon = <Icon name={`cc-icon-${lang}`} />;
      }
      // TODO do other languages have icons?
    }
    return (
      <Button
        key={`kernel-${lang}-${name}`}
        onClick={() => this.props.actions.select_kernel(name)}
        bsSize={size}
      >
        {icon} {this.kernel_name(name)}
      </Button>
    );
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
            <Col sm={6}>{this.render_kernel_button(name)}</Col>
            <Col sm={6}>
              <div>{this.render_suggested_link(cocalc)}</div>
            </Col>
          </Row>
        );
      });

    if (entries.length == 0) return;

    return (
      <Row style={row_style}>
        <h4>Suggested kernels</h4>
        <Col>{entries}</Col>
      </Row>
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

  render_all_langs(): Rendered[] | undefined {
    if (this.props.kernels_by_language == null) return;
    const label: React.CSSProperties = {
      fontWeight: "bold",
      color: COLORS.GRAY_D
    };
    const all: Rendered[] = [];
    this.props.kernels_by_language.forEach((names, lang) => {
      const kernels = names.map(name =>
        this.render_kernel_button(name, "small", false)
      );
      all.push(
        <Row key={lang} style={row_style}>
          <Col sm={2} style={label}>
            {misc.capitalize(lang)}
          </Col>
          <Col sm={10}>
            <ButtonGroup>{kernels}</ButtonGroup>
          </Col>
        </Row>
      );
      return true;
    });

    return all;
  }

  render_all() {
    if (this.props.kernels_by_language == null) return;

    return (
      <Row style={row_style}>
        <h4>All kernels</h4>
        <Col>{this.render_all_langs()}</Col>
      </Row>
    );
  }

  render_last() {
    if (this.props.default_kernel == null) return;
    return (
      <Row style={row_style}>
        <h4>Quick selection</h4>
        <div>
          Your most recently selected kernel was:{" "}
          {this.render_kernel_button(this.props.default_kernel)}
        </div>
      </Row>
    );
  }

  render_top() {
    if (this.props.kernel == null) {
      let msg: string;
      if (this.props.kernel_info != null) {
        msg = "This notebook kernel is unknown.";
      } else {
        msg = "This notebook has no kernel.";
      }
      return (
        <Row style={row_style}>
          <strong>{msg}</strong> A working kernel is required in order to
          evaluate the code in the notebook. Based on the programming language
          you want to work with, you have to select one.
        </Row>
      );
    } else {
      return (
        <Row style={row_style}>
          Select a new kernel. (Currently selected:{" "}
          <code>{this.kernel_name(this.props.kernel)}</code>)
        </Row>
      );
    }
  }

  render_unknown() {
    const closestKernel = this.props.closestKernel;
    if (this.props.kernel_info != null || closestKernel == null) return;
    const closestKernelName = closestKernel.get("name");
    if (closestKernelName == null) return;

    return (
      <Row style={row_style}>
        <Alert bsStyle={"danger"}>
          <h3>Unknown Kernel</h3>
          <div>
            A similar kernel might be{" "}
            {this.render_kernel_button(closestKernelName)}.
          </div>
        </Alert>
      </Row>
    );
  }

  render_footer(): Rendered {
    return (
      <Row style={row_style}>
        <strong>Note:</strong> You can always change the selected kernel later
        via the »Kernel« menu enty.
      </Row>
    );
  }

  render() {
    let body: Rendered;
    if (
      this.props.kernels_by_name == null ||
      this.props.kernel_selection == null
    ) {
      body = (
        <Row style={row_style}>
          <Loading />
        </Row>
      );
    } else {
      body = (
        <>
          {this.render_top()}
          {this.render_unknown()}
          {this.render_last()}
          {this.render_suggested()}
          {this.render_all()}
          <hr/>
          {this.render_footer()}
        </>
      );
    }
    return (
      <Col style={main_style} md={8} mdOffset={2}>
        <Row style={row_style}>
          <h3>{"Select a Kernel"}</h3>
        </Row>
        {body}
      </Col>
    );
  }
}
