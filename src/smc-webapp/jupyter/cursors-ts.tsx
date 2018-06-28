/*
React component that represents cursors of other users.
*/

// How long until another user's cursor is no longer displayed, if they don't move.
// (NOTE: might take a little longer since we use a long interval.)
const CURSOR_TIME_S = 15;

import {
  React,
  Component,
  rclass,
  rtypes,
  ReactDOM
} from "../app-framework"; // TODO: this will move
import { Map as ImmutableMap } from "immutable";
const misc = require("smc-util/misc");

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
  shouldComponentUpdate(nextProps, nextState) {
    if (this.props.time !== nextProps.time) {
      this.show_name(2000);
    }
    return (
      misc.is_different(this.props, nextProps, ["name", "color"]) ||
      this.state.show_name !== nextState.show_name
    );
  }

  getInitialState() {
    return { show_name: true };
  }

  componentDidMount() {
    this._mounted = true;
    return this._set_timer(2000);
  }

  componentWillUnmount() {
    return (this._mounted = false);
  }

  _clear_timer() {
    if (this._timer != null) {
      clearTimeout(this._timer);
      return delete this._timer;
    }
  }

  _set_timer(timeout: number) {
    this._clear_timer();
    return (this._timer = setTimeout(() => this.hide_name(), timeout));
  }

  hide_name() {
    if (!this._mounted) {
      return;
    }
    this._clear_timer();
    return this.setState({ show_name: false });
  }

  show_name = (timeout?: number) => {
    if (!this._mounted) {
      return;
    }
    this.setState({ show_name: true });
    if (timeout) {
      return this._set_timer(timeout);
    }
  };

  render() {
    // onClick is needed for mobile.
    return (
      <span
        style={{
          color: this.props.color,
          position: "relative",
          cursor: "text",
          pointerEvents: "all",
          top: this.props.top
        }}
        onMouseEnter={() => this.show_name()}
        onMouseLeave={() => this.show_name(2000)}
        onTouchStart={() => this.show_name()}
        onTouchEnd={() => this.show_name(2000)}
      >
        <span
          style={{
            width: 0,
            height: "1em",
            borderLeft: "2px solid",
            position: "absolute"
          }}
        />
        <span
          style={{
            width: "6px",
            left: "-2px",
            top: "-2px",
            height: "6px",
            position: "absolute",
            backgroundColor: this.props.color
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
              opacity: 0.8
            }}
          >
            {this.props.name}
          </span>
        ) : (
          undefined
        )}
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
  shouldComponentUpdate(next) {
    return misc.is_different(this.props, next, [
      "line",
      "ch",
      "name",
      "color",
      "time"
    ]);
  }

  _render_cursor(props: any) {
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

  componentDidMount() {
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

  _position_cursor() {
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
      return setTimeout(this._position_cursor, 1000);
    } else {
      return this.props.codemirror.addWidget(this._pos, this._elt, false);
    }
  }

  componentWillReceiveProps(next) {
    if (this._elt == null) {
      return;
    }
    if (this.props.line !== next.line || this.props.ch !== next.ch) {
      this._pos = { line: next.line, ch: next.ch };
      this._position_cursor();
    }
    // Always update how widget is rendered (this will at least cause it to display for 2 seconds after move/change).
    return this._render_cursor(next);
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._elt != null) {
      ReactDOM.unmountComponentAtNode(this._elt);
      this._elt.remove();
      return delete this._elt;
    }
  }

  render() {
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
  shouldComponentUpdate(nextProps) {
    return (
      this.props.line !== nextProps.line ||
      this.props.ch !== nextProps.ch ||
      this.props.name !== nextProps.name ||
      this.props.color !== nextProps.color
    );
  }

  render() {
    let _;
    const style: React.CSSProperties = {
      position: "absolute",
      height: 0,
      lineHeight: "normal",
      fontFamily: "monospace",
      whiteSpace: "pre",
      top: "4px", // must match what is used in codemirror-static.
      left: "4px",
      pointerEvents: "none" // so clicking in the spaces (the string position below) doesn't break click to focus cell.
    };

    // we position using newlines and blank spaces, so no measurement is needed.
    const position =
      (() => {
        let asc, end;
        const result: any[] = [];
        for (
          _ = 0, end = this.props.line, asc = 0 <= end;
          asc ? _ < end : _ > end;
          asc ? _++ : _--
        ) {
          result.push("\n");
        }
        return result;
      })().join("") +
      (() => {
        let asc1, end1;
        const result1: any[] = [];
        for (
          _ = 0, end1 = this.props.ch, asc1 = 0 <= end1;
          asc1 ? _ < end1 : _ > end1;
          asc1 ? _++ : _--
        ) {
          result1.push(" ");
        }
        return result1;
      })().join("");
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
  cursors: ImmutableMap<any, any>;
  codemirror?: any; // optional codemirror editor instance
  // ReduxProps
  user_map: ImmutableMap<any, any>;
  account_id: string;
}

interface CursorsState {
  n: number;
}

class Cursors0 extends Component<CursorsProps, CursorsState> {
  private _interval: any;
  public static reduxProps = {
    users: {
      user_map: rtypes.immutable.Map
    },
    account: {
      account_id: rtypes.string
    }
  };

  constructor(props: CursorsProps, context: any) {
    super(props, context);
    this.state = { n: 0 };
  }

  shouldComponentUpdate(props, state) {
    return (
      misc.is_different(
        this.props,
        props,
        ["cursors", "user_map", "account_id"]
      ) || this.state.n !== state.n
    );
  }

  componentDidMount() {
    this._interval = setInterval(
      () => this.setState({ n: this.state.n + 1 }),
      (CURSOR_TIME_S / 2) * 1000
    );
  }

  componentWillUnmount() {
    clearInterval(this._interval);
  }

  profile = (account_id: any) => {
    let color, name;
    const user = this.props.user_map.get(account_id);
    if (user != null) {
      let left;
      color =
        (left = user.getIn(["profile", "color"])) != null
          ? left
          : "rgb(170,170,170)";
      name = misc.trunc_middle(
        user.get("first_name") + " " + user.get("last_name"),
        60
      );
    } else {
      color = "rgb(170,170,170)";
      name = "Private User";
    }
    return { color, name };
  };

  render() {
    let C: any;
    const now = misc.server_time();
    const v: any[] = [];
    if (this.props.codemirror != null) {
      C = PositionedCursor;
    } else {
      C = StaticPositionedCursor;
    }
    if (this.props.cursors != null) {
      this.props.cursors.forEach((locs: any, account_id: any) => {
        const { color, name } = this.profile(account_id);
        return locs.forEach(pos => {
          if (now - pos.get("time") <= CURSOR_TIME_S * 1000) {
            let left, left1;
            if (account_id === this.props.account_id) {
              // don't show our own cursor (we just haven't made this possible due to only keying by accoun_id)
              return;
            }
            v.push(
              <C
                key={v.length}
                time={pos.get("time") - 0}
                color={color}
                name={name}
                line={(left = pos.get("y")) != null ? left : 0}
                ch={(left1 = pos.get("x")) != null ? left1 : 0}
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
