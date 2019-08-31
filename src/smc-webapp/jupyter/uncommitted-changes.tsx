/*
Component that shows a warning message if has_uncommitted_changes is true for more than a few seconds.
*/

import { React, Component } from "../app-framework";

const STYLE: React.CSSProperties = {
  backgroundColor: "red",
  color: "white",
  padding: "5px",
  fontWeight: "bold",
  marginLeft: "5px",
  marginRight: "-5px",
  borderRadius: "3px"
};

interface UncommittedChangesProps {
  has_uncommitted_changes?: boolean;
  delay_ms: number; // assumed not to change, default 5000
}

interface UncommittedChangesState {
  counter: number;
}

export class UncommittedChanges extends Component<
  UncommittedChangesProps,
  UncommittedChangesState
> {
  private _last_change: any; // TODO: necessary
  private _mounted: boolean; // TODO: refactor away from
  constructor(props: UncommittedChangesProps, context: any) {
    super(props, context);
    this.state = { counter: 0 };
  }
  static defaultProps = { delay_ms: 5000 };
  shouldComponentUpdate(nextProps, nextState) {
    return (
      this.props.has_uncommitted_changes !==
        nextProps.has_uncommitted_changes ||
      this.state.counter !== nextState.counter
    );
  }
  _check = () => {
    if (this._mounted && this.props.has_uncommitted_changes) {
      // forces a re-render
      return this.setState({ counter: this.state.counter + 1 });
    }
  };
  componentWillUpdate(new_props) {
    if (
      new_props.has_uncommitted_changes !== this.props.has_uncommitted_changes
    ) {
      this._last_change = new Date();
    }
    if (new_props.has_uncommitted_changes) {
      setTimeout(this._check, this.props.delay_ms + 10);
    }
  }
  componentWillUnmount() {
    this._mounted = false;
  }
  componentDidMount() {
    this._mounted = true;
    this._last_change = new Date(); // from truly undefined to known
    setTimeout(this._check, this.props.delay_ms + 10);
  }
  render() {
    if (!this.props.has_uncommitted_changes) {
      return <span />; // TODO: return undefined?
    }
    if (this._last_change == null) {
      this._last_change = new Date();
    }
    // TODO: better types
    if ((new Date() as any) - this._last_change < this.props.delay_ms!) {
      return <span />; // TODO: return undefined?
    }
    return <span style={STYLE}>NOT saved!</span>;
  }
}
