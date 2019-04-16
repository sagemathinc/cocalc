import {WidgetModel, WidgetView} from "@jupyter-widgets/base";

export class BoxModel extends WidgetModel {
  public widget_manager: any;
  public is_react : boolean = true;

  defaults() {
    return {
      ...super.defaults()
    };
  }

  initialize(attributes: any, options: any) {
    super.initialize(attributes, options);
  }
}

export class BoxView extends WidgetView {
  public model: BoxModel;
  public is_react : boolean = true;

  render() {
    console.log("render box view");
  }
}



export class VBoxModel extends WidgetModel {
  public widget_manager: any;
  public is_react : boolean = true;

  defaults() {
    return {
      ...super.defaults()
    };
  }

  initialize(attributes: any, options: any) {
    super.initialize(attributes, options);
  }
}

export class VBoxView extends WidgetView {
  public model: BoxModel;
  public is_react : boolean = true;

  render() {
    console.log("render box view");
  }
}
