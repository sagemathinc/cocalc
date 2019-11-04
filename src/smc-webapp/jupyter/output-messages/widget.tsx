/*
Widget rendering.
*/

const $ = require("jquery");

import { Map, Set, List, fromJS } from "immutable";

import { Tabs, Tab } from "react-bootstrap";

import {
  React,
  ReactDOM,
  Component,
  Rendered,
  rclass,
  rtypes
} from "smc-webapp/app-framework";
import { JupyterActions } from "../browser-actions";

import * as pWidget from "@phosphor/widgets";

require("@jupyter-widgets/controls/css/widgets.css");

import { CellOutputMessages } from "./message";

import { NotebookFrameActions } from "../../frame-editors/jupyter-editor/cell-notebook/actions";

interface WidgetProps {
  value: Map<string, any>;
  actions?: JupyterActions;
  frame_actions?: NotebookFrameActions;
  name?: string;
  project_id?: string;
  directory?: string;
  trust?: boolean;

  //redux
  widget_model_ids?: Set<string>;
}

interface WidgetState {
  outputs?: Map<string, any>;
  style?: any;
  react_view?: List<string> | string;
}

export class Widget0 extends Component<WidgetProps, WidgetState> {
  private view?: any;
  private model?: any;
  private init_view_is_running: boolean = false;
  private mounted: boolean = false;

  public static reduxProps({ name }) {
    return {
      [name]: {
        widget_model_ids: rtypes.immutable.Set
      }
    };
  }

  public constructor(props, context) {
    super(props, context);

    this.update_output = this.update_output.bind(this);
    this.update_react_view = this.update_react_view.bind(this);

    // state is used to store output state, for output widgets, which we render.
    this.state = {};
  }

  shouldComponentUpdate(
    nextProps: WidgetProps,
    nextState: WidgetState
  ): boolean {
    const model_id = this.props.value.get("model_id");
    const next_model_id = nextProps.value.get("model_id");
    if (model_id != next_model_id) {
      // the component is being reused for a completely different model,
      // so get rid of anything currently used.
      this.remove_view();
    }
    if (
      this.view == null &&
      nextProps.widget_model_ids != null &&
      nextProps.widget_model_ids.contains(next_model_id)
    ) {
      // view not yet initialized and model is now known, so initialize it.
      this.init_view(next_model_id);
    }

    // Only do not update, if neither state that is used for rendering the
    // react part of the widget might have got updated.  We use ===
    // for speed.
    if (
      nextState.outputs === this.state.outputs &&
      nextState.react_view === this.state.react_view
    ) {
      return false;
    }

    return true;
  }

  componentDidMount(): void {
    this.mounted = true;

    if (
      this.props.widget_model_ids != null &&
      this.props.widget_model_ids.contains(this.props.value.get("model_id"))
    ) {
      // model known already
      this.init_view(this.props.value.get("model_id"));
    }
  }

  componentWillUnmount(): void {
    this.mounted = false;
    // always clean up
    this.remove_view();
  }

  update_output(): void {
    if (!this.mounted) return;
    const state = this.model.get_state(true);
    if (state == null || state.outputs == null) {
      this.setState({ outputs: undefined, style: undefined });
      return;
    }
    const outputs = {};
    for (const i in state.outputs) {
      outputs[i] = state.outputs[i];
    }
    this.setState({ outputs: fromJS(outputs) });
    if (
      this.state.style == null &&
      state.layout != null &&
      state.layout.changed != null
    ) {
      // TODO: we only set style once, this first time it is known.
      // If the layout were to dynamically change, this won't update.
      this.setState({ style: state.layout.changed });
    }
  }

  update_react_view(): void {
    if (!this.mounted) return;
    const state = this.model.get_state(true);
    if (state == null) {
      this.setState({ react_view: undefined });
      return;
    }
    if (state.children == null) {
      // special case for now when not a container but implemented in react.s
      this.setState({ react_view: "unknown" });
      return;
    }
    const react_view: string[] = [];
    for (const child of state.children) {
      react_view.push(child.model_id);
    }
    this.setState({ react_view: fromJS(react_view) });
  }

  async init_view(model_id: string | undefined): Promise<void> {
    if (this.init_view_is_running) {
      // it's already running right now.
      return;
    }
    try {
      this.init_view_is_running = true;
      if (model_id == null) return; // probably never happens ?
      if (this.props.actions == null) {
        return; // no way to do anything right now(?)
        // TODO: maybe can still render widget based on some stored state somewhere?
      }
      const widget_manager = this.props.actions.widget_manager;
      if (widget_manager == null) {
        return;
      }
      this.model = await widget_manager.get_model(model_id);
      if (this.model == null || !this.mounted) {
        // no way to render at present; wait for widget_counter to increase and try again.
        return;
      }

      if (this.model.is_react) {
        this.update_react_view();
        this.model.on("change", this.update_react_view);
        return;
      }

      switch (this.model.module) {
        case "@jupyter-widgets/controls":
        case "@jupyter-widgets/base":
          // Right now we use phosphor views for many base and controls.
          // TODO: we can iteratively rewrite some of these using react
          // for a more consistent look and feel (with bootstrap).
          await this.init_phosphor_view(model_id);
          break;

        case "@jupyter-widgets/output":
          this.model.on("change", this.update_output);
          this.update_output();
          break;

        default:
          throw Error(`Not implemented widget module ${this.model.module}`);
      }
    } catch (err) {
      // TODO -- show an error component somehow...
      console.trace();
      console.warn("widget.tsx: init_view -- failed ", err);
    } finally {
      this.init_view_is_running = false;
    }
  }

  remove_view(): void {
    if (this.view != null) {
      this.view.remove(); // no clue what this does...
      delete this.view.send;
      delete this.view;
    }
    if (this.model != null) {
      if (this.model.module == "@jupyter-widgets/output") {
        this.model.off("change", this.update_output);
      }
      delete this.model;
    }
  }

  render_phosphor(): Rendered {
    // This div is managed by phosphor, so don't put any react in it!
    return <div key="phosphor" ref="phosphor" />;
  }

  handle_phosphor_focus(): void {
    if (this.props.actions == null) return;
    const elt = ReactDOM.findDOMNode(this.refs.phosphor);
    if (elt == null) return;
    // See https://stackoverflow.com/questions/7668525/is-there-a-jquery-selector-to-get-all-elements-that-can-get-focus
    const focuseable = $(elt).find(
      "a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, *[tabindex], *[contenteditable]"
    );
    if (focuseable.length > 0) {
      focuseable.on("focus", () => {
        if (this.props.frame_actions != null) {
          this.props.frame_actions.disable_key_handler();
        }
      });
      focuseable.on("blur", () => {
        if (this.props.frame_actions != null) {
          this.props.frame_actions.enable_key_handler();
        }
      });
    }
  }

  // Configure handler for custom messages, e.g.,
  // {event:"click"} when button is clicked.
  handle_phosphor_custom_events(model_id: string): void {
    if (this.view == null) return;
    this.view.send = content => {
      if (!this.mounted || this.props.actions == null) return;
      const data = { method: "custom", content };
      this.props.actions.send_comm_message_to_kernel(model_id, data);
    };
  }

  async init_phosphor_view(model_id: string): Promise<void> {
    if (this.props.actions == null) return;
    const widget_manager = this.props.actions.widget_manager;
    if (widget_manager == null) {
      return;
    }
    const view = await widget_manager.create_view(this.model);
    if (!this.mounted) return;
    this.view = view as any;
    const elt = ReactDOM.findDOMNode(this.refs.phosphor);
    if (elt == null) return;
    pWidget.Widget.attach(this.view.pWidget, elt);
    this.handle_phosphor_focus();
    this.handle_phosphor_custom_events(model_id);
  }

  render_output(): Rendered {
    if (this.state.outputs == null) return;
    return (
      <div key="output" style={this.state.style}>
        <CellOutputMessages
          output={this.state.outputs}
          actions={this.props.actions}
          name={this.props.name}
          project_id={this.props.project_id}
          directory={this.props.directory}
          trust={this.props.trust}
        />
      </div>
    );
  }

  render_react_view(): Rendered {
    if (this.state.react_view == null) return;
    if (typeof this.state.react_view == "string") {
      return (
        <div style={{ margin: "5px" }}>
          <a
            style={{ color: "white", background: "red", padding: "5px" }}
            href={"https://github.com/sagemathinc/cocalc/issues/3806"}
            target={"_blank"}
            rel={"noopener noreferrer"}
          >
            Unsupported Third Party Widget{" "}
            <code>
              {this.model.module}.{this.model.name}
            </code>
            ...
          </a>
        </div>
      );
    }
    if (this.model == null) return;
    switch (this.model.name) {
      case "TabModel":
        return this.render_react_tab_view();
      case "AccordionModel":
        return this.render_react_accordion_view();
      case "HBoxModel":
      case "VBoxModel":
      case "GridBoxView":
      case "BoxModel":
        return this.render_react_box_view();
      default:
        // better than nothing.
        return this.render_react_box_view();
    }
  }

  render_react_tab_view(): Rendered {
    if (this.state.react_view == null) return;
    if (typeof this.state.react_view == "string") return;
    if (this.model == null) return;

    const v: Rendered[] = [];
    let i = 0;
    for (const model_id of this.state.react_view.toJS()) {
      v.push(
        <Tab eventKey={i} key={i} title={this.model.attributes._titles[i]}>
          <Widget
            value={fromJS({ model_id })}
            actions={this.props.actions}
            name={this.props.name}
          />
        </Tab>
      );
      i += 1;
    }

    return (
      <Tabs
        activeKey={this.model.attributes.selected_index}
        onSelect={selected_index => {
          if (this.model) {
            this.model.set_state({ selected_index });
          }
        }}
        id={"tabs" + this.model.model_id}
      >
        {v}
      </Tabs>
    );
  }

  render_react_accordion_view(): undefined | Rendered {
    if (this.state.react_view == null) return;
    if (typeof this.state.react_view == "string") return;
    if (this.model == null) return;
    return (
      <div>
        <div style={{ color: "#888" }}>
          Accordion not implemented, so falling back to tabs
        </div>
        {this.render_react_tab_view()}
      </div>
    );
    // TODO: we have to upgrade to modern react-bootstrap
    // (see https://github.com/sagemathinc/cocalc/issues/3782)
    // or implement this from scratch since our react-bootstrap,
    // which is doc'd at
    // https://5c507d49471426000887a6a7--react-bootstrap.netlify.com/components/navs/
    // doesn't have Accordion.  (There's code
    // but it isn't documented...).
  }

  render_react_box_view(): undefined | Rendered {
    if (this.state.react_view == null) return;
    if (typeof this.state.react_view == "string") return;
    const v: Rendered[] = [];
    let i = 0;
    for (const model_id of this.state.react_view.toJS()) {
      v.push(
        <Widget
          key={i}
          value={fromJS({ model_id })}
          actions={this.props.actions}
          name={this.props.name}
        />
      );
      i += 1;
    }
    // todo -- this is hackish; fix later.
    let cls = "jupyter-widgets widget-container";
    switch (this.model.name) {
      case "BoxModel":
        cls += " widget-box";
        break;
      case "HBoxModel":
        cls += " widget-box widget-hbox";
        break;
      case "VBoxModel":
        cls += " widget-box widget-vbox";
        break;
      case "GridBoxView":
        cls += " widget-gridbox";
        break;
    }
    return <div className={cls}>{v}</div>;
  }

  render(): Rendered {
    return (
      <div>
        {this.render_phosphor()}
        {this.render_output()}
        {this.render_react_view()}
      </div>
    );
  }
}

export const Widget = rclass(Widget0);
