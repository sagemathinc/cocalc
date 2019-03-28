/*
Widget rendering.
*/

import { React, ReactDOM, Component, Rendered } from "smc-webapp/app-framework";
import { Map } from "immutable";
import { JupyterActions } from "../browser-actions";

import * as pWidget from "@phosphor/widgets";

interface WidgetProps {
  value: Map<string, any>;
  actions?: JupyterActions;
}

export class Widget extends Component<WidgetProps> {
  private view: any;

  shouldComponentUpdate(nextProps: WidgetProps): boolean {
    return !this.props.value.equals(nextProps.value);
  }

  componentDidMount(): void {
    this.init_view();
  }

  componentWillUnmount(): void {
    this.remove_view();
  }

  async init_view(): Promise<void> {
    const model_id: string | undefined = this.props.value.get("model_id");
    if (model_id == null) return; // probably never happens ?
    if (this.props.actions == null) {
      console.log("no actions");
      return; // no way to do anything right now(?)
      // TODO: maybe can still render widget based on some stored state somewhere?
    }
    const widget_manager = this.props.actions.widget_manager;
    if (widget_manager == null) {
      console.log("no widget_manager");
      return;
    }
    const model = await widget_manager.get_model(model_id);
    if (model == null) {
      // no way to render at present.-
      return;
    }
    console.log("model = ", model);

    const view = await widget_manager.create_view(model);
    console.log("view = ", view);
    this.view = view as any;

    const elt = ReactDOM.findDOMNode(this);
    pWidget.Widget.attach(this.view.pWidget, elt);
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
