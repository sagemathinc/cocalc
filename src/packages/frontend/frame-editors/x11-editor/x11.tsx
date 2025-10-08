/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
X11 Window frame.
*/

import { delay } from "awaiting";
import { Map, Set } from "immutable";
import { debounce } from "lodash";
import { AccountState } from "@cocalc/frontend/account/types";
import {
  Rendered,
  useEffect,
  useIsMountedRef,
  useMemo,
  usePrevious,
  useRedux,
  useRef,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { retry_until_success } from "@cocalc/util/async-utils";
import { DEFAULT_FONT_SIZE } from "@cocalc/util/consts/ui";
import { cmp } from "@cocalc/util/misc";
import { Actions } from "./actions";
import { TAB_BAR_GREY } from "./theme";
import { WindowTab } from "./window-tab";

interface Props {
  actions: Actions;
  name: string;
  id: string;
  desc: Map<string, any>;
  is_current: boolean;
  font_size: number;
  reload?: number;
  editor_settings: AccountState["editor_settings"];
  resize: number;
}

export function X11({
  actions,
  name,
  id,
  desc,
  is_current,
  font_size,
  reload,
  editor_settings,
  resize,
}: Props) {
  const is_mounted = useIsMountedRef();
  const is_loaded = useRef<boolean>(false);
  const windowRef = useRef<HTMLDivElement>(null as any);
  const focusRef = useRef<HTMLTextAreaElement>(null as any);

  const default_font_size =
    useTypedRedux("account", "font_size") ?? DEFAULT_FONT_SIZE;
  const windows: Map<string, any> = useRedux(name, "windows");
  const x11_is_idle: boolean = useRedux(name, "x11_is_idle");
  const disabled: boolean = useRedux(name, "disabled");
  const config_unknown: boolean = useRedux(name, "config_unknown");

  const measure_size = debounce(_measure_size, 200, {
    leading: true,
    trailing: true,
  });

  useEffect(() => {
    // keyboard layout change
    actions.set_physical_keyboard(
      editor_settings.get("physical_keyboard"),
      editor_settings.get("keyboard_variant"),
    );
  }, [
    editor_settings.get("physical_keyboard"),
    editor_settings.get("keyboard_variant"),
  ]);

  // reload or font size change -- measure and resize again.
  useEffect(() => {
    measure_size();
  }, [resize, desc.get("font_size"), reload]);

  useEffect(() => {
    if (is_current) focus_textarea();
  }, [is_current]);

  // tab change (i.e. different wid) or just got loaded?
  useEffect(() => {
    insert_window_in_dom();
  }, [desc.get("wid")]);

  // just got loaded?
  useEffect(() => {
    if (!is_loaded.current && desc.get("wid") != null) {
      insert_window_in_dom();
    }
  }, [windows, desc.get("wid")]);

  // children changed?
  const prevWindows = usePrevious(windows);
  const children = useMemo(() => {
    const wid = desc.get("wid");
    return windows?.getIn([wid, "children"], Set()) as any;
  }, [windows, desc.get("wid")]);
  const prevChildren = usePrevious(children);

  useEffect(() => {
    if (windows == null) return;
    if (prevWindows === windows) return;
    if (!is_loaded.current) return;
    if (!children.equals(prevChildren)) {
      insert_children_in_dom(children.subtract(prevChildren));
    }
  }, [windows, prevWindows, children, prevChildren]);

  useEffect(() => {
    if (windows == null) return;
    const wid = desc.get("wid");
    const children = windows?.getIn([wid, "children"], Set()) as any;
    insert_children_in_dom(children);
  }, [windows, desc.get("wid")]);

  useEffect(() => {
    // "wait" until window node is available
    const load = async () =>
      retry_until_success({
        f: async () => {
          const node: any = windowRef.current;
          if (node == null) {
            throw new Error("x11 window node not yet available");
          } else {
            disable_browser_context_menu();
            // earlier, when this was a Component, this was called – but it's not a good idea.
            // this call always fails, causes an endless loop until the timeout
            // rather, wait until the client learns about the windows and the effect with "!is_loaded" kicks in
            //await insert_window_in_dom(true);
          }
        },
        max_time: 60000,
        max_delay: 150,
      });
    load();

    // set keyboard layout
    actions.set_physical_keyboard(
      editor_settings.get("physical_keyboard"),
      editor_settings.get("keyboard_variant"),
    );

    return () => {
      is_loaded.current = false;
    };
  }, []);

  function disable_browser_context_menu(): void {
    const node: any = windowRef.current;
    // Get rid of browser context menu, which makes no sense on a canvas.
    // See https://stackoverflow.com/questions/10864249/disabling-right-click-context-menu-on-a-html-canvas
    // NOTE: this would probably make sense in DOM mode instead of canvas mode;
    // if we switch, disable this...
    $(node).on("contextmenu", function () {
      return false;
    });
  }

  async function insert_window_in_dom(): Promise<void> {
    if (!is_mounted.current) {
      return;
    }
    const node: any = windowRef.current;
    const client = actions.client;
    if (client == null) {
      // will never happen -- to satisfy typescript
      return;
    }
    const wid = desc.get("wid");
    if (wid == null) {
      is_loaded.current = false;
      $(node).empty();
      return;
    }
    try {
      client.insert_window_in_dom(wid, node);
      await insert_children_in_dom(
        windows.getIn([wid, "children"], Set()) as any,
      );
    } catch (err) {
      // window not available right now.
      is_loaded.current = false;
      $(node).empty();
      return;
    }
    measure_size();
    is_loaded.current = true;
    await delay(0);
    if (!is_mounted.current || wid !== desc.get("wid")) {
      return;
    }
    measure_size();
    if (is_current) {
      client.focus_window(wid);
    }
  }

  async function insert_children_in_dom(wids: Set<number>): Promise<void> {
    const client = actions.client;
    if (client == null) {
      // will never happen -- to satisfy typescript
      return;
    }
    wids.forEach((wid) => {
      client.insert_child_in_dom(wid);
    });
    await delay(0);
    measure_size();
  }

  function _measure_size(): void {
    const client = actions.client;
    if (client == null) {
      // to satisfy typescript
      return;
    }
    const wid = desc.get("wid");
    if (wid == null) {
      return;
    }
    const node: any = $(windowRef.current);
    const width = node.width(),
      height = node.height();
    if (width == null || height == null) {
      return;
    }
    const frame_scale = font_size / default_font_size;
    client.resize_window(wid, width, height, frame_scale);
  }

  function render_window_tabs(): Rendered[] {
    const v: Rendered[] = [];
    if (windows == null) {
      return v;
    }
    const wids = windows.keySeq().toJS();
    wids.sort(cmp); // since sort uses string cmp by default
    for (const wid of wids) {
      if (windows.getIn([wid, "parent"])) {
        // don't render a tab for modal dialogs (or windows on top of others that block them).
        continue;
      }
      v.push(
        <WindowTab
          id={id}
          key={wid}
          is_current={wid === desc.get("wid")}
          info={windows.get(wid)}
          actions={actions}
        />,
      );
    }
    return v;
  }

  function render_tab_bar(): Rendered {
    return (
      <div
        style={{
          borderBottom: "1px solid lightgrey",
          background: TAB_BAR_GREY,
          display: "inline-flex",
        }}
      >
        {render_window_tabs()}
      </div>
    );
  }

  function render_window_div(): Rendered {
    return (
      <div
        className="smc-vfill"
        ref={windowRef}
        style={{ position: "relative" }}
        onClick={() => {
          focus_textarea();
          // TODO:
          // const client = actions.client;
          // (client as any).client.mouse_inject(ev);
        }}
      />
    );
  }

  function focus_textarea(): void {
    const node: any = focusRef.current;
    $(node).trigger("focus");
    const client = actions.client;
    if (client == null) {
      return;
    }
    client.focus();
  }

  function textarea_blur(): void {
    const client = actions.client;
    if (client == null) {
      return;
    }
    client.blur();
  }

  function on_paste(e): boolean {
    const value: string = e.clipboardData.getData("Text");
    actions.paste(id, value);
    return false;
  }

  function render_hidden_textarea(): Rendered {
    return (
      <textarea
        style={{
          opacity: 0,
          position: "absolute",
          height: 0,
          width: 0,
          top: 0,
        }}
        aria-multiline="false"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        tabIndex={0}
        ref={focusRef}
        onBlur={() => textarea_blur()}
        onPaste={(e) => on_paste(e)}
      />
    );
  }

  function not_idle(): void {
    actions.x11_not_idle();
  }

  function render_idle(): Rendered {
    if (!x11_is_idle) {
      return;
    }
    return (
      <div
        onClick={not_idle}
        style={{
          position: "absolute",
          fontSize: "36pt",
          color: "white",
          backgroundColor: "#458ac9",
          textAlign: "center",
          width: "100%",
          height: "100%",
          cursor: "pointer",
          zIndex: 1,
          opacity: 0.7,
        }}
      >
        Idle
        <br />
        (click to resume)
      </div>
    );
  }

  if (disabled == null || config_unknown == null) return <Loading />;

  if (disabled) {
    const no_info = config_unknown
      ? "There is no X11 configuration information available. You might have to restart this project"
      : "";
    return (
      <div className="smc-vfill" style={{ padding: "100px auto auto auto" }}>
        X11 is not available for this project. {no_info}
      </div>
    );
  }

  return (
    <div className="smc-vfill" style={{ position: "relative" }}>
      {render_idle()}
      {render_tab_bar()}
      {render_hidden_textarea()}
      {render_window_div()}
    </div>
  );
}
