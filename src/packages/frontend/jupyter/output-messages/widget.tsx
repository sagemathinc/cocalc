/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Widget rendering.
*/

import $ from "jquery";
import { Map, List, fromJS } from "immutable";
import { Tabs, Tab } from "../../antd-bootstrap";
import { Alert } from "antd";
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import useDelayedRender from "@cocalc/frontend/app-framework/delayed-render-hook";
import { usePrevious, useRedux } from "@cocalc/frontend/app-framework";

import { JupyterActions } from "../browser-actions";
import * as pWidget from "@lumino/widgets";
require("@jupyter-widgets/controls/css/widgets.css");
import { CellOutputMessages } from "./message";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { A, Loading } from "@cocalc/frontend/components";
import getSupportURL from "@cocalc/frontend/support/url";

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
    const render = useDelayedRender(1000); // use to delay for 1s before telling user they might need to run some code.
    const { value, actions, name, project_id, directory, trust } = props;
    const frameActions = useNotebookFrameActions();
    const prev_value = usePrevious(value);

    const [isLoading, setIsLoading] = useState<boolean>(false);

    const phosphorRef = useRef<HTMLDivElement>(null);
    const reactBoxRef = useRef<HTMLDivElement>(null);

    // Note: this is potentially confusing, since isUnsupported is a string.
    // It's "" if supported as far as we know, and a string -- usually the
    // name of the unsupported widget -- if not.
    const [isUnsupported, setIsUnsupported] = useState<string>("");
    const widgetModelIdState: Map<string, string> = useRedux([
      name,
      "widgetModelIdState",
    ]);

    const view = useRef<any>();
    const model = useRef<any>();
    const init_view_is_running = useRef<boolean>(false);
    const is_mounted = useIsMountedRef();

    // WidgetState: used to store output state, for output widgets, which we render.
    const [outputs, set_outputs] = useState<Map<string, any> | undefined>();
    const [style, set_style] = useState<any>();
    const [react_view, set_react_view] = useState<
      List<string> | string | undefined
    >();

    useEffect(() => {
      if (widgetModelIdState.get("model_id") === "") {
        // model already created and working.
        init_view(value.get("model_id"));
      }
      return () => {
        // always clean up
        remove_view();
      };
    }, []);

    useEffect(() => {
      if (prev_value == null) return;
      const prev_model_id = prev_value.get("model_id");
      const next_model_id = value.get("model_id");
      if (prev_model_id != next_model_id) {
        // the component is being reused for a completely different model,
        // so get rid of anything currently used.
        remove_view();
      }
    }, [value]);

    useEffect(() => {
      if (view.current != null) {
        // view already initialized
        return;
      }
      const model_id = value.get("model_id");
      const state = widgetModelIdState.get(model_id);
      if (state == null) {
        // no info yet.
        return;
      }
      if (state === "") {
        // view not yet initialized, but model is now known, so we initialize it:
        init_view(model_id);
      } else if (state == "loading") {
        setIsLoading(true);
      } else {
        // unfortunately widget manager has found that this widget isn't supported right now.
        setIsUnsupported(state);
      }
    }, [widgetModelIdState]);

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
          // no way to render at present; we will wait for widgetModelIdState to
          // change, then try again...
          return;
        }

        if (model.current.is_react) {
          update_react_view();
          model.current.on("change", update_react_view);
          return;
        }

        switch (model.current.module) {
          case "@jupyter-widgets/output":
            model.current.on("change", update_output);
            update_output();
            break;

          default:
            // Right now we use Lumino views for many base and controls.
            // TODO: we can iteratively rewrite some of these using react
            // for a more consistent look and feel (with antd).
            await init_lumino_view(model_id);
            break;
        }
      } catch (err) {
        // TODO -- show an error component somehow...
        console.trace();
        console.warn("widget.tsx: init_view -- failed ", err);
        if (model.current != null) {
          setIsUnsupported(`${model.current.module}.${model.current.name}`);
        } else {
          setIsUnsupported(`initializing view failed - ${err}`);
        }
      } finally {
        setIsLoading(false);
        init_view_is_running.current = false;
      }
    }

    function remove_view(): void {
      if (view.current != null) {
        try {
          view.current.remove();
        } catch (_err) {
          // console.trace();
          // after changing this to an FC, calling remove() causes
          // 'Widget is not attached.' in phosphorjs.
          // The way I found to trigger this is to concurrently work
          // on the same cell with two tabs. It recovers fine from catching this,
          // so the following is commented out.  Uncomment it if you want
          // to debug this.
          // console.warn(`widget/remove_view error: ${_err}`);
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

    async function init_lumino_view(model_id: string): Promise<void> {
      if (actions == null) return;
      const widget_manager = actions.widget_manager;
      if (widget_manager == null) {
        return;
      }
      // console.log("now actually creating the view from widget.tsx:")
      try {
        view.current = await widget_manager.create_view(model.current, {});
        if (!is_mounted.current) return;
      } catch (err) {
        if (!is_mounted.current) return;
        setIsUnsupported(
          `view of ${model.current.module}.${model.current.name} - ${err}`
        );
        return;
      }

      const elt = ReactDOM.findDOMNode(phosphorRef.current);
      if (elt == null) return;
      pWidget.Widget.attach(view.current.pWidget, elt as any);
      handle_phosphor_focus();
      handle_phosphor_custom_events(model_id);
      // @ts-ignore: this is a jquery plugin I wrote to use our icons
      // to process <i class="fa fa-...."/> which happen to be used a
      // lot in widgets, annoyingly.  So you have to test everything in
      // each widget, then possibly add icons (or aliases) to
      // frontend/components/icon.tsx that handles the missing ones.
      $(elt).processIcons();
    }

    function renderUnsupported() {
      return (
        <div style={{ margin: "5px 0" }}>
          <div
            style={{ color: "white", background: "crimson", padding: "15px" }}
          >
            Unsupported Widget:{" "}
            <code style={{ padding: "5px" }}>{isUnsupported}</code>
          </div>
          <A
            href={getSupportURL({
              subject: "Unsupported Widget",
              body: `I am using a Jupyter notebook, and ran into trouble with a widget -- ${isUnsupported}...`,
              type: "question",
            })}
          >
            (Create support ticket...)
          </A>
        </div>
      );
    }

    function renderReactView(): JSX.Element | undefined {
      if (react_view == null) return;
      if (typeof react_view == "string") {
        return renderUnsupported();
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
      // TODO: we have to rewrite using antd:
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
        {!isUnsupported &&
          widgetModelIdState.get(value.get("model_id")) == null &&
          (render ? (
            <Alert
              style={{ margin: "15px" }}
              type="warning"
              message="You probably need to run some code to see this widget."
            />
          ) : (
            <span></span>
          ))}
        {isUnsupported && renderUnsupported()}
        {isLoading && !isUnsupported && (
          <Loading
            theme="medium"
            style={{ margin: "15px" }}
            text="Loading Widget..."
          />
        )}
        {/* This key='phosphor' div's content is managed by phosphor, so don't put any react in it! */}
        <div key="phosphor" ref={phosphorRef} style={{ overflow: "hidden" }} />
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
