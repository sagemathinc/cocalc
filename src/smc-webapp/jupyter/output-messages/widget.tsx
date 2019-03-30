/*
Widget rendering.
*/

import {
  React,
  ReactDOM,
  Component,
  Rendered,
  rclass,
  rtypes
} from "smc-webapp/app-framework";
import { Map, Set } from "immutable";
import { JupyterActions } from "../browser-actions";

import * as pWidget from "@phosphor/widgets";

require("@jupyter-widgets/controls/css/widgets.css");

interface WidgetProps {
  value: Map<string, any>;
  actions?: JupyterActions;
  name?: string;

  //redux
  widget_model_ids?: Set<string>;
}

export class Widget0 extends Component<WidgetProps> {
  private view?: any;
  private init_view_is_running: boolean = false;
  private mounted: boolean = false;

  public static reduxProps({ name }) {
    return {
      [name]: {
        widget_model_ids: rtypes.immutable.Set
      }
    };
  }

  shouldComponentUpdate(nextProps: WidgetProps): boolean {
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
    return false; // no actual react update ever
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

  async init_view(model_id: string | undefined): Promise<void> {
    if (this.init_view_is_running) {
      // it's already running right now.
      return;
    }
    try {
      this.init_view_is_running = true;
      if (model_id == null) return; // probably never happens ?
      if (this.props.actions == null) {
        //console.log("no actions");
        return; // no way to do anything right now(?)
        // TODO: maybe can still render widget based on some stored state somewhere?
      }
      const widget_manager = this.props.actions.widget_manager;
      if (widget_manager == null) {
        //console.log("no widget_manager");
        return;
      }
      const model = await widget_manager.get_model(model_id);
      if (model == null || !this.mounted) {
        // no way to render at present; wait for widget_counter to increase and try again.
        return;
      }

      const view = await widget_manager.create_view(model);
      if (!this.mounted) return;
      this.view = view as any;

      const elt = ReactDOM.findDOMNode(this);
      pWidget.Widget.attach(this.view.pWidget, elt);
    } catch (err) {
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
  }

  render(): Rendered {
    return <div />;
  }
}

export const Widget = rclass(Widget0);
