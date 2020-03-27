/*
React component that represents cursors of other users.
*/

// How long until another user's cursor is no longer displayed, if they don't move.
// (NOTE: might take a little longer since we use a long interval.)
const CURSOR_TIME_MS = 20000;
const HIDE_NAME_TIMEOUT_MS = 3000;

import { Map } from "immutable";
import {
  React,
  Component,
  rclass,
  rtypes,
  ReactDOM,
  Rendered,
} from "../app-framework";

import { times_n } from "./util";

import { server_time, trunc_middle, is_different } from "smc-util/misc";

const UNKNOWN_USER_PROFILE = {
  color: "rgb(170,170,170)",
  name: "Private User",
};

interface CursorProps {
  name: string;
  color: string;
  top?: string; // doesn't change
  time?: number;
}

interface CursorState {
  show_name?: boolean;
}

export class Cursor extends Component<CursorProps, CursorState> {
  private _mounted: any; // TODO: dont do this
  private _timer: any;

  constructor(props, context) {
    super(props, context);
    this.state = { show_name: true };
  }

  public shouldComponentUpdate(
    nextProps: CursorProps,
    nextState: CursorState
  ): boolean {
    if (this.props.time !== nextProps.time) {
      this.show_name(HIDE_NAME_TIMEOUT_MS);
    }
    return (
      is_different(this.props, nextProps, ["name", "color"]) ||
      this.state.show_name !== nextState.show_name
    );
  }

  public componentDidMount(): void {
    this._mounted = true;
    this._set_timer(HIDE_NAME_TIMEOUT_MS);
  }

  public componentWillUnmount(): void {
    this._mounted = false;
  }

  private _clear_timer(): void {
    if (this._timer != null) {
      clearTimeout(this._timer);
      delete this._timer;
    }
  }

  private _set_timer(timeout: number): void {
    this._clear_timer();
    this._timer = setTimeout(() => this.hide_name(), timeout);
  }

  private hide_name(): void {
    if (!this._mounted) {
      return;
    }
    this._clear_timer();
    this.setState({ show_name: false });
  }

  private show_name(timeout?: number): void {
    if (!this._mounted) {
      return;
    }
    this.setState({ show_name: true });
    if (timeout) {
      this._set_timer(timeout);
    }
  }

  public render(): Rendered {
    return (
      <span
        style={{
          color: this.props.color,
          position: "relative",
          cursor: "text",
          pointerEvents: "all",
          top: this.props.top,
        }}
        onMouseEnter={() => this.show_name()}
        onMouseLeave={() => this.show_name(HIDE_NAME_TIMEOUT_MS)}
        onTouchStart={() => this.show_name()}
        onTouchEnd={() => this.show_name(HIDE_NAME_TIMEOUT_MS)}
      >
        <span
          style={{
            width: 0,
            height: "1em",
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
            backgroundColor: this.props.color,
          }}
        />
        {this.state.show_name ? (
          <span
            style={{
              position: "absolute",
              fontSize: "10pt",
              color: "#fff",
              top: "-2px",
              left: "-2px",
              padding: "2px",
              whiteSpace: "nowrap",
              background: this.props.color,
              fontFamily: "sans-serif",
              boxShadow: "3px 3px 5px 0px #bbb",
              opacity: 0.8,
            }}
          >
            {this.props.name}
          </span>
        ) : undefined}
      </span>
    );
  }
}

interface PositionedCursorProps {
  name: string;
  color: string;
  line: number;
  ch: number;
  codemirror: any;
  time?: number;
}

class PositionedCursor extends Component<PositionedCursorProps> {
  private _elt: any;
  private _mounted: any; // TODO: dont do this
  private _pos: any;

  public shouldComponentUpdate(next: PositionedCursorProps): boolean {
    return is_different(this.props, next, [
      "line",
      "ch",
      "name",
      "color",
      "time",
    ]);
  }

  private _render_cursor(props: PositionedCursorProps): Rendered {
    return ReactDOM.render(
      <Cursor
        name={props.name}
        color={props.color}
        top={"-1.2em"}
        time={this.props.time}
      />,
      this._elt
    );
  }

  public componentDidMount(): void {
    this._mounted = true;
    this._elt = document.createElement("div");
    this._elt.style.position = "absolute";
    this._elt.style["z-index"] = "5";
    this._render_cursor(this.props);
    this.props.codemirror.addWidget(
      { line: this.props.line, ch: this.props.ch },
      this._elt,
      false
    );
  }

  private _position_cursor(): void {
    if (!this._mounted || this._pos == null || this._elt == null) {
      return;
    }
    // move the cursor widget to pos:
    // A *big* subtlety here is that if one user holds down a key and types a lot, then their
    // cursor will move *before* their new text arrives.  This sadly leaves the cursor
    // being placed in a position that does not yet exist, hence fails.   To address this,
    // if the position does not exist, we retry.
    const x = this.props.codemirror.getLine(this._pos.line);
    if (x == null || this._pos.ch > x.length) {
      // oh crap, impossible to position cursor!  Try again in 1s.
      setTimeout(this._position_cursor, 1000);
    } else {
      this.props.codemirror.addWidget(this._pos, this._elt, false);
    }
  }

  public componentWillReceiveProps(next: PositionedCursorProps): void {
    if (this._elt == null) {
      return;
    }
    if (this.props.line !== next.line || this.props.ch !== next.ch) {
      this._pos = { line: next.line, ch: next.ch };
      this._position_cursor();
    }
    // Always update how widget is rendered (this will at least cause it to display for 2 seconds after move/change).
    this._render_cursor(next);
  }

  public componentWillUnmount(): void {
    this._mounted = false;
    if (this._elt != null) {
      ReactDOM.unmountComponentAtNode(this._elt);
      this._elt.remove();
      delete this._elt;
    }
  }

  public render(): Rendered {
    // A simple (unused) container to satisfy react.
    return <span />;
  }
}

interface StaticPositionedCursorProps {
  name: string;
  color: string;
  line: number;
  ch: number;
  time?: number;
}

class StaticPositionedCursor extends Component<StaticPositionedCursorProps> {
  public shouldComponentUpdate(
    nextProps: StaticPositionedCursorProps
  ): boolean {
    return (
      this.props.line !== nextProps.line ||
      this.props.ch !== nextProps.ch ||
      this.props.name !== nextProps.name ||
      this.props.color !== nextProps.color
    );
  }

  public render(): Rendered {
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
    const position =
      times_n("\n", this.props.line) + times_n(" ", this.props.ch);
    return (
      <div style={style}>
        {position}
        <Cursor
          time={this.props.time}
          name={this.props.name}
          color={this.props.color}
        />
      </div>
    );
  }
}

interface CursorsProps {
  // OwnProps
  cursors: Map<string, any>;
  codemirror?: any; // optional codemirror editor instance
  // ReduxProps
  user_map?: Map<string, any>;
  account_id?: string;
}

interface CursorsState {
  n: number;
}

class Cursors0 extends Component<CursorsProps, CursorsState> {
  private _interval: any;

  public static reduxProps = () => ({
    users: {
      user_map: rtypes.immutable.Map,
    },
    account: {
      account_id: rtypes.string,
    },
  });

  constructor(props, context) {
    super(props, context);
    this.state = { n: 0 };
  }

  public shouldComponentUpdate(
    props: CursorsProps,
    state: CursorsState
  ): boolean {
    return (
      is_different(this.props, props, ["cursors", "user_map", "account_id"]) ||
      this.state.n !== state.n
    );
  }

  public componentDidMount(): void {
    this._interval = setInterval(
      () => this.setState({ n: this.state.n + 1 }),
      CURSOR_TIME_MS / 2
    );
  }

  public componentWillUnmount(): void {
    clearInterval(this._interval);
  }

  private profile(account_id: string): { color: string; name: string } {
    if (this.props.user_map == null) return UNKNOWN_USER_PROFILE;
    const user = this.props.user_map.get(account_id);
    if (user == null) return UNKNOWN_USER_PROFILE;
    const color = user.getIn(["profile", "color"], "rgb(170,170,170)");
    const name = trunc_middle(
      user.get("first_name", "") + " " + user.get("last_name", ""),
      60
    );
    return { color, name };
  }

  public render(): Rendered {
    let C: any;
    const now = server_time().valueOf();
    const v: any[] = [];
    if (this.props.codemirror != null) {
      C = PositionedCursor;
    } else {
      C = StaticPositionedCursor;
    }
    if (this.props.cursors != null && this.props.user_map != null) {
      this.props.cursors.forEach((locs: any, account_id: any) => {
        const { color, name } = this.profile(account_id);
        locs.forEach((pos) => {
          const tm = pos.get("time");
          if (tm == null) {
            return;
          }
          const t = tm.valueOf();
          if (now - t <= CURSOR_TIME_MS) {
            /* if (account_id === this.props.account_id) {
              // Don't show our own cursor, we just haven't made this
              // possible due to only keying by account_id.
              return;
            }*/
            v.push(
              <C
                key={v.length}
                time={t}
                color={color}
                name={name}
                line={pos.get("y", 0)}
                ch={pos.get("x", 0)}
                codemirror={this.props.codemirror}
              />
            );
          }
        });
      });
    }
    return (
      <div style={{ position: "relative", height: 0, zIndex: 5 }}>{v}</div>
    );
  }
}

export const Cursors = rclass(Cursors0);
