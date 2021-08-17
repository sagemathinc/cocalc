/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Widget rendering.
*/

import $ from "jquery";
import { Map, Set, List, fromJS } from "immutable";
import { Tabs, Tab } from "../../antd-bootstrap";
import React, { useRef, useState } from "react";
import ReactDOM from "react-dom";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import { usePrevious, useRedux } from "@cocalc/frontend/app-framework";

import { JupyterActions } from "../browser-actions";
import * as pWidget from "@phosphor/widgets";
require("@jupyter-widgets/controls/css/widgets.css");
import { CellOutputMessages } from "./message";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";

interface WidgetProps {
  value: Map<string, any>;
  actions?: JupyterActions;
  name: string;
  project_id?: string;
  directory?: string;
  trust?: boolean;
}

export const Widget: React.FC<WidgetProps> = React.memo(
  (props: WidgetProps) => {
    const { value, actions, name, project_id, directory, trust } = props;
    const frameActions = useNotebookFrameActions();
    const prev_value = usePrevious(value);

    const phosphorRef = useRef<HTMLDivElement>(null);
    const reactBoxRef = useRef<HTMLDivElement>(null);

    const view = useRef<any>();
    const model = useRef<any>();
    const init_view_is_running = useRef<boolean>(false);
    const is_mounted = useIsMountedRef();
    const widget_model_ids: Set<string> = useRedux([name, "widget_model_ids"]);

    // WidgetState: used to store output state, for output widgets, which we render.
    const [outputs, set_outputs] = useState<Map<string, any> | undefined>();
    const [style, set_style] = useState<any>();
    const [react_view, set_react_view] = useState<
      List<string> | string | undefined
    >();

    React.useEffect(() => {
      if (widget_model_ids?.contains(value.get("model_id"))) {
        // model known already
        init_view(value.get("model_id"));
      }
      return () => {
        // always clean up
        remove_view();
      };
    }, []);

    React.useEffect(() => {
      if (prev_value == null) return;
      const prev_model_id = prev_value.get("model_id");
      const next_model_id = value.get("model_id");
      if (prev_model_id != next_model_id) {
        // the component is being reused for a completely different model,
        // so get rid of anything currently used.
        remove_view();
      }
    }, [value]);

    React.useEffect(() => {
      if (view.current != null) return;
      const model_id = value.get("model_id");
      // view not yet initialized and model is now known, so initialize it.
      if (widget_model_ids?.contains(model_id)) {
        init_view(model_id);
      }
    }, [widget_model_ids]);

    function update_output(): void {
      if (!is_mounted.current) return;
      const state: { layout?: { changed: any }; outputs: unknown[] } =
        model.current.get_state(true);
      if (state == null || state.outputs == null) {
        set_outputs(undefined);
        set_style(undefined);
        return;
      }
      const outputs = {};
      for (const i in state.outputs) {
        outputs[i] = state.outputs[i];
      }
      set_outputs(fromJS(outputs));
      if (state?.layout?.changed != null) {
        // TODO: we only set style once, this first time it is known.
        // If the layout were to dynamically change, this won't update.
        set_style(state.layout.changed);
      }
    }

    function update_react_view(): void {
      if (!is_mounted.current) return;
      const state = model.current.get_state(true);
      if (state == null) {
        set_react_view(undefined);
        return;
      }
      if (state.children == null) {
        // special case for now when not a container but implemented in react.s
        set_react_view("unknown");
        return;
      }
      const react_view: string[] = [];
      for (const child of state.children) {
        react_view.push(child.model_id);
      }
      set_react_view(fromJS(react_view));
    }

    async function init_view(model_id: string | undefined): Promise<void> {
      if (init_view_is_running.current) {
        // it's already running right now.
        return;
      }
      try {
        init_view_is_running.current = true;
        if (model_id == null) return; // probably never happens ?
        if (actions == null) {
          return; // no way to do anything right now(?)
          // TODO: maybe can still render widget based on some stored state somewhere?
        }
        const widget_manager = actions.widget_manager;
        if (widget_manager == null) {
          return;
        }
        model.current = await widget_manager.get_model(model_id);
        if (model.current == null || !is_mounted.current) {
          // no way to render at present; wait for widget_counter to increase and try again.
          return;
        }

        if (model.current.is_react) {
          update_react_view();
          model.current.on("change", update_react_view);
          return;
        }

        switch (model.current.module) {
          case "@jupyter-widgets/controls":
          case "@jupyter-widgets/base":
            // Right now we use phosphor views for many base and controls.
            // TODO: we can iteratively rewrite some of these using react
            // for a more consistent look and feel (with bootstrap).
            await init_phosphor_view(model_id);
            break;

          case "@jupyter-widgets/output":
            model.current.on("change", update_output);
            update_output();
            break;

          default:
            throw Error(
              `Not implemented widget module ${model.current.module}`
            );
        }
      } catch (err) {
        // TODO -- show an error component somehow...
        console.trace();
        console.warn("widget.tsx: init_view -- failed ", err);
      } finally {
        init_view_is_running.current = false;
      }
    }

    function remove_view(): void {
      if (view.current != null) {
        try {
          view.current.remove(); // no clue what this does...
        } catch (err) {
          // after changing this to an FC, calling remove() causes
          // 'Widget is not attached.' in phosphorjs.
          // The only way I found to trigger this is to concurrently work
          // on the same cell with two tabs. It recovers fine from catching this!
          console.warn(`widget/remove_view error: ${err}`);
        }
        view.current.send = undefined;
        view.current = undefined;
      }
      if (model.current != null) {
        if (model.current.module == "@jupyter-widgets/output") {
          model.current.off("change", update_output);
        }
        model.current = undefined;
      }
    }

    function handle_phosphor_focus(): void {
      if (actions == null) return;
      const elt = ReactDOM.findDOMNode(phosphorRef.current);
      if (elt == null) return;
      // See https://stackoverflow.com/questions/7668525/is-there-a-jquery-selector-to-get-all-elements-that-can-get-focus
      const focuseable = $(elt).find(
        "a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, *[tabindex], *[contenteditable]"
      );
      if (focuseable.length > 0) {
        focuseable.on("focus", () => {
          frameActions.current?.disable_key_handler();
        });
        focuseable.on("blur", () => {
          frameActions.current?.enable_key_handler();
        });
      }
    }

    // Configure handler for custom messages, e.g.,
    // {event:"click"} when button is clicked.
    function handle_phosphor_custom_events(model_id: string): void {
      if (view.current == null) return;
      view.current.send = (content) => {
        if (!is_mounted.current || actions == null) return;
        const data = { method: "custom", content };
        actions.send_comm_message_to_kernel(model_id, data);
      };
    }

    async function init_phosphor_view(model_id: string): Promise<void> {
      if (actions == null) return;
      const widget_manager = actions.widget_manager;
      if (widget_manager == null) {
        return;
      }
      const view_next = await widget_manager.create_view(model.current);
      if (!is_mounted.current) return;
      view.current = view_next as any;
      const elt = ReactDOM.findDOMNode(phosphorRef.current);
      if (elt == null) return;
      pWidget.Widget.attach(view.current.pWidget, elt as any);
      handle_phosphor_focus();
      handle_phosphor_custom_events(model_id);
    }

    function renderReactView(): JSX.Element | undefined {
      if (react_view == null) return;
      if (typeof react_view == "string") {
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
                {model.current.module}.{model.current.name}
              </code>
              ...
            </a>
          </div>
        );
      }
      if (model.current == null) return;
      switch (model.current.name) {
        case "TabModel":
          return renderReactTabView();
        case "AccordionModel":
          return renderReactAccordionView();
        case "HBoxModel":
        case "VBoxModel":
        case "GridBoxView":
        case "GridBoxModel":
        case "BoxModel":
          return renderReactBoxView();
        default:
          // better than nothing.
          return renderReactBoxView();
      }
    }

    function renderReactTabView(): JSX.Element | undefined {
      if (react_view == null) return;
      if (typeof react_view == "string") return;
      if (model.current == null) return;

      const v: JSX.Element[] = [];
      let i = 0;
      for (const model_id of react_view.toJS()) {
        const key = `${i}`;
        v.push(
          <Tab
            eventKey={key}
            key={key}
            title={model.current.attributes._titles[i]}
          >
            <Widget
              value={fromJS({ model_id })}
              actions={actions}
              name={name}
            />
          </Tab>
        );
        i += 1;
      }

      return (
        <Tabs
          activeKey={`${model.current.attributes.selected_index}`}
          onSelect={(selected_index) => {
            model.current?.set_state({ selected_index });
          }}
          id={`tabs${model.current.model_id}`}
        >
          {v}
        </Tabs>
      );
    }

    function renderReactAccordionView(): undefined | JSX.Element {
      if (react_view == null) return;
      if (typeof react_view == "string") return;
      if (model.current == null) return;
      return (
        <div>
          <div style={{ color: "#888" }}>
            Accordion not implemented, so falling back to tabs
          </div>
          {renderReactTabView()}
        </div>
      );
      // TODO: we have to upgrade to modern react-bootstrap
      // (see https://github.com/sagemathinc/cocalc/issues/3782)
      // or implement this from scratch since our react-bootstrap,
      // which is doc'd at
      // https://5c507d49471426000887a6a7--react-bootstrap.netlify.com/components/navs/
      // doesn't have Accordion.  (There's code
      // but it isn't documented...).
      // Actually we are entirely switching away from
      // bootstrap, so use the accordion here:
      //    https://ant.design/components/collapse/
    }

    function renderReactBoxView(): undefined | JSX.Element {
      if (react_view == null) return;
      if (typeof react_view == "string") return;
      const v: JSX.Element[] = [];
      let i = 0;
      for (const model_id of react_view.toJS()) {
        v.push(
          <Widget
            key={i}
            value={fromJS({ model_id })}
            actions={actions}
            name={name}
          />
        );
        i += 1;
      }
      let cls = "jupyter-widgets widget-container";
      switch (model.current.name) {
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
        case "GridBoxModel":
          cls += " widget-gridbox";
          break;
      }
      setTimeout(() => {
        if (!is_mounted.current) return;

        // This is a ridiculously horrible hack, but I can
        // think of no other possible way to do it, and we're
        // lucky it happens to work (due to internal implementation
        // details of phosphor).  The motivation for this is
        // that in the function render_phosphor above we
        // make a react node whose *contents* get managed by
        // Phosphor for all the interesting widgets such as
        // text and buttons that are NOT implemented in React.
        // Unfortunately, all the style and layout of
        // ipywidgets assumes that this extra level of wrapping
        // isn't there and is broken by this.  So we set things
        // up like that, then copy the style and class from
        // the elements that phosphor creates to the wrapper elements
        // that we create.
        // See https://github.com/sagemathinc/cocalc/issues/5228
        // and https://github.com/sagemathinc/cocalc/pull/5273

        const elt = ReactDOM.findDOMNode(reactBoxRef.current);
        const container = $(elt as any);
        const children = container.children().children();
        for (const child of children) {
          const a = $(child);
          const p = a.parent();
          p.attr("class", a.attr("class") ?? null);
          p.attr("style", a.attr("style") ?? null);
        }
      }, 1);

      return (
        <div
          className={cls}
          style={getLayoutStyle(model.current)}
          ref={reactBoxRef}
        >
          {v}
        </div>
      );
    }

    return (
      <>
        {/* This div is managed by phosphor, so don't put any react in it! */}
        <div key="phosphor" ref={phosphorRef} />
        {outputs && (
          <div key="output" style={style}>
            <CellOutputMessages
              output={outputs}
              actions={actions}
              name={name}
              project_id={project_id}
              directory={directory}
              trust={trust}
            />
          </div>
        )}
        {renderReactView()}
      </>
    );
  }
);

export function getLayoutStyle(model) {
  const attributes = model?.attributes?.layout?.attributes;
  if (attributes == null) return;
  const style = {};
  for (const x in attributes) {
    if (x.startsWith("_")) continue;
    const y = attributes[x];
    if (y != null) {
      style[snakeCaseToCamelCase(x)] = y;
    }
  }
  return style;
}

// Modified version of
// https://www.npmjs.com/package/@ivanhanak_com/snake-case-to-camel-case
function snakeCaseToCamelCase(string) {
  let split = string.split("_");

  if (split.length) {
    const firstWord = split.shift();

    split = split
      .map((word) => word.trim())
      .filter((word) => word.length > 0)
      .map((word) => {
        const firstLetter = word.substring(0, 1).toUpperCase();
        const restOfTheWord = word.substring(1).toLowerCase();

        return `${firstLetter}${restOfTheWord}`;
      });

    split.unshift(firstWord);

    return split.join("");
  } else {
    return string;
  }
}
