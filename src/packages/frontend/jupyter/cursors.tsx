/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
React component that represents cursors of other users.
*/

// How long until another user's cursor is no longer displayed, if they don't move.
// (NOTE: might take a little longer since we use a long interval.)
const CURSOR_TIME_MS = 20000;
const HIDE_NAME_TIMEOUT_MS = 1500;

import { MutableRefObject, useRef, useState, useEffect } from "react";
import { Map } from "immutable";
import { React, ReactDOM, Rendered, useTypedRedux } from "../app-framework";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";

import { times_n } from "./util";

import { server_time, trunc_middle, is_different } from "@cocalc/util/misc";
import { IS_SAFARI, IS_FIREFOX } from "@cocalc/frontend/feature";

const UNKNOWN_USER_PROFILE = {
  color: "rgb(170,170,170)",
  name: "Private User",
};

interface CursorProps {
  name: string;
  color: string;
  top?: string; // doesn't change
  time?: number;
  paddingText?: string; // paddingText -- only used in slate to move cursor over one letter to place cursor at end of text
  showNameRef?: MutableRefObject<((time?) => void) | null>;
}

export const Cursor: React.FC<CursorProps> = React.memo(
  (props: CursorProps) => {
    const { name, color, top, time, paddingText, showNameRef } = props;
    const isMountedRef = useIsMountedRef();

    const timer = useRef<number | null>(null);
    const [render_name, set_render_name] = useState<boolean>(true);

    useEffect(() => {
      set_timer(HIDE_NAME_TIMEOUT_MS);
      return () => {
        clear_timer();
      };
    }, []);

    useEffect(() => {
      show_name(HIDE_NAME_TIMEOUT_MS);
    }, [time]);

    function clear_timer(): void {
      if (timer.current != null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }

    function set_timer(timeout: number): void {
      clear_timer();
      timer.current = window.setTimeout(hide_name, timeout);
    }

    function hide_name(): void {
      if (!isMountedRef.current) return;
      clear_timer();
      set_render_name(false);
    }

    function show_name(timeout?: number): void {
      if (!isMountedRef.current) return;
      set_render_name(true);
      if (timeout) {
        set_timer(timeout);
      }
    }

    if (showNameRef != null) {
      showNameRef.current = show_name;
    }

    function renderCursor(): Rendered {
      if (!paddingText) {
        return (
          <>
            <span
              style={{
                width: 0,
                left: 0,
                top: 0,
                height: "1.4em",
                borderLeft: "2px solid",
                position: "absolute",
              }}
            />
            <span
              style={{
                width: "6px",
                left: "-2px",
                top: "-2px",
                height: "6px",
                position: "absolute",
                backgroundColor: color,
              }}
            />
          </>
        );
      }

      return (
        <>
          <span
            style={{
              left: 0,
              top: 0,
              height: "1em",
              borderRight: "2px solid",
              position: "absolute",
            }}
          >
            {renderPaddingText()}
          </span>
        </>
      );
    }

    function renderPaddingText() {
      if (paddingText) {
        return <span style={{ color: "transparent" }}>{paddingText}</span>;
      }
    }

    return (
      <span
        style={{
          color: color,
          position: "relative",
          cursor: "text",
          pointerEvents: "all",
          top: top,
        }}
        onMouseEnter={() => show_name()}
        onMouseLeave={() => show_name(HIDE_NAME_TIMEOUT_MS)}
        onTouchStart={() => show_name()}
        onTouchEnd={() => show_name(HIDE_NAME_TIMEOUT_MS)}
      >
        {renderCursor()}
        {render_name ? (
          <span
            style={{
              position: "absolute",
              fontSize: "10pt",
              color: "#fff",
              top: "-2px",
              left: "8px",
              padding: "2px",
              whiteSpace: "nowrap",
              background: color,
              fontFamily: "sans-serif",
              boxShadow: "3px 3px 5px 0px #bbb",
              borderRadius: "3px",
              zIndex: 1,
            }}
          >
            {renderPaddingText()}
            {name}
          </span>
        ) : undefined}
      </span>
    );
  },
  (prev, next) => !is_different(prev, next, ["name", "color", "paddingText"])
);

interface PositionedCursorProps {
  name: string;
  color: string;
  line: number;
  ch: number;
  codemirror: any;
  time?: number;
}

const PositionedCursor: React.FC<PositionedCursorProps> = React.memo(
  (props: PositionedCursorProps) => {
    const { name, color, line, ch, codemirror, time } = props;
    const isMountedRef = useIsMountedRef();
    const elt = useRef<HTMLDivElement | null>(null);
    const posRef = useRef<{ line: number; ch: number } | null>(null);
    const showNameRef = useRef<((time?) => void) | null>(null);

    useEffect(() => {
      elt.current = document.createElement("div");
      elt.current.style.position = "absolute";
      elt.current.style["z-index"] = "5";
      renderCursor();
      codemirror.addWidget({ line, ch }, elt.current, false);
      return () => {
        if (elt.current != null) {
          ReactDOM.unmountComponentAtNode(elt.current);
          elt.current.remove();
          elt.current = null;
        }
      };
    }, []);

    useEffect(() => {
      posRef.current = { line, ch };
      positionCursor();
      // Always update how widget is rendered (this will at least cause it
      // to display for 2 seconds after move/change).
      renderCursor();
    }, [line, ch]);

    function positionCursor(): void {
      if (
        !isMountedRef.current ||
        posRef.current == null ||
        elt.current == null
      ) {
        return;
      }

      // move the cursor widget to pos:
      const pos = posRef.current;
      // A *big* subtlety here is that if one user holds down a key and types a lot, then their
      // cursor will move *before* their new text arrives.  This sadly leaves the cursor
      // being placed in a position that does not yet exist, hence fails.   To address this,
      // if the position does not exist, we retry.
      const x = codemirror.getLine(pos.line);
      if (x == null || pos.ch > x.length) {
        // oh crap, impossible to position cursor!  Try again in 1s.
        setTimeout(positionCursor, 1000);
      } else {
        codemirror.addWidget(pos, elt.current, false);
        showNameRef.current?.(2000);
      }
    }

    function renderCursor(): void {
      if (elt.current != null) {
        ReactDOM.render(
          <Cursor
            name={name}
            color={color}
            top={IS_FIREFOX ? "0px" : IS_SAFARI ? "-1ex" : "-1.2em"}
            time={time}
            showNameRef={showNameRef}
          />,
          elt.current
        );
      }
    }

    // A simple (unused) container to satisfy react.
    return <span />;
  },
  (prev, next) =>
    !is_different(prev, next, ["line", "ch", "name", "color", "time"])
);

interface StaticPositionedCursorProps {
  name: string;
  color: string;
  line: number;
  ch: number;
  time?: number;
}

const StaticPositionedCursor: React.FC<StaticPositionedCursorProps> =
  React.memo(
    (props: StaticPositionedCursorProps) => {
      const { name, color, line, ch, time } = props;

      const style: React.CSSProperties = {
        position: "absolute",
        height: 0,
        lineHeight: "normal",
        fontFamily: "monospace",
        whiteSpace: "pre",
        top: "4px", // must match what is used in codemirror-static.
        left: "4px",
        pointerEvents: "none", // so clicking in the spaces (the string position below) doesn't break click to focus cell.
      };

      // we position using newlines and blank spaces, so no measurement is needed.
      const position = times_n("\n", line) + times_n(" ", ch);

      return (
        <div style={style}>
          {position}
          <Cursor time={time} name={name} color={color} />
        </div>
      );
    },
    (prev, next) =>
      prev.line === next.line &&
      prev.ch === next.ch &&
      prev.name === next.name &&
      prev.color === next.color
  );

export type CursorsType = Map<string, any>;

interface CursorsProps {
  cursors: CursorsType;
  codemirror?: any; // optional codemirror editor instance
}

export const Cursors: React.FC<CursorsProps> = React.memo(
  (props: CursorsProps) => {
    const { cursors, codemirror } = props;
    const user_map = useTypedRedux("users", "user_map");
    const [, set_n] = useState<number>(0);

    useEffect(() => {
      const id = setInterval(() => set_n((n) => n + 1), CURSOR_TIME_MS / 2);
      return () => clearInterval(id);
    }, []);

    const now = server_time().valueOf();
    const v: any[] = [];
    const C: any =
      codemirror != null ? PositionedCursor : StaticPositionedCursor;
    if (cursors != null && user_map != null) {
      cursors.forEach((locs: any, account_id: any) => {
        const { color, name } = getProfile(account_id, user_map);
        locs.forEach((pos) => {
          const tm = pos.get("time") ?? new Date();
          const t = tm.valueOf();
          if (now - t <= CURSOR_TIME_MS) {
            v.push(
              <C
                key={v.length}
                time={t}
                color={color}
                name={name}
                line={pos.get("y", 0)}
                ch={pos.get("x", 0)}
                codemirror={codemirror}
              />
            );
          }
        });
      });
    }
    return (
      <div style={{ position: "relative", height: 0, zIndex: 5 }}>{v}</div>
    );
  },
  (prev, next) => !is_different(prev, next, ["cursors"])
);

export function getProfile(
  account_id,
  user_map
): { color: string; name: string } {
  if (user_map == null) return UNKNOWN_USER_PROFILE;
  const user = user_map.get(account_id);
  if (user == null) return UNKNOWN_USER_PROFILE;
  const color = user.getIn(["profile", "color"], "rgb(170,170,170)");
  const name = trunc_middle(
    user.get("first_name", "") + " " + user.get("last_name", ""),
    60
  );
  return { color, name };
}
