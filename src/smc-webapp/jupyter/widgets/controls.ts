/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { WidgetModel, WidgetView } from "@jupyter-widgets/base";

export class ReactModel extends WidgetModel {
  public widget_manager: any;
  public is_react: boolean = true;

  serializers = {}; // just use JSON.

  defaults() {
    return {
      ...super.defaults(),
    };
  }

  initialize(attributes: any, options: any) {
    super.initialize(attributes, options);
  }
}

export class ReactView extends WidgetView {
  public model: BoxModel;
  public is_react: boolean = true;

  render() {
    console.log("render box view");
  }
}

export class BoxModel extends ReactModel {}
export class BoxView extends ReactView {}

export class GridBoxModel extends ReactModel {}
export class GridBoxView extends ReactView {}

export class VBoxModel extends ReactModel {}
export class VBoxView extends ReactView {}

export class HBoxModel extends ReactModel {}
export class HBoxView extends ReactView {}

export class AccordionModel extends ReactModel {}
export class AccordionView extends ReactView {}

export class TabModel extends ReactModel {}
export class TabView extends ReactView {}

export class UnsupportedModel extends ReactModel {}
export class UnsupportedView extends ReactView {}
