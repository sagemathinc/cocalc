/*
Widget rendering.
*/

import { Map, Set, fromJS } from "immutable";

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

//import { Stdout } from "./stdout";
//import { Stderr } from "./stderr";

interface WidgetProps {
  value: Map<string, any>;
  actions?: JupyterActions;
  name?: string;

  //redux
  widget_model_ids?: Set<string>;
}

interface WidgetState {
  output?: Map<string, any>;
  style?: any;
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
    if (nextState.output == null) return false;
    return !nextState.output.equals(this.state);
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
    if (state == null || state.value == null) {
      this.setState({ output: undefined, style: undefined });
      return;
    }
    const output = {};
    for (let i in state.value) {
      output[i] = state.value[i];
    }
    this.setState({ output: fromJS(output) });
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

      switch (this.model.module) {
        case "@jupyter-widgets/controls":
        case "@jupyter-widgets/base":
          // Right now we use phosphor views for all base and controls.
          // TODO: we can iteratively rewrite some of these using react for a more
          // consistent look and feel...
          const view = await widget_manager.create_view(this.model);
          if (!this.mounted) return;
          this.view = view as any;
          const elt = ReactDOM.findDOMNode(this.refs.phosphor);
          if (elt == null) return;
          pWidget.Widget.attach(this.view.pWidget, elt);
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

  render_output(): Rendered {
    if (this.state.output == null) return;
    return (
      <div key="output" style={this.state.style}>
        <CellOutputMessages output={this.state.output} />
      </div>
    );
  }

  render(): Rendered {
    return (
      <div>
        {this.render_phosphor()}
        {this.render_output()}
      </div>
    );
  }
}

export const Widget = rclass(Widget0);
