import * as hoistStatics from "hoist-non-react-statics";
import * as React from "react";

interface State {
  should_render: boolean;
}

/**
 * Allows two animation frames to complete to allow other components to update
 * and re-render before mounting and rendering an expensive `WrappedComponent`.
 */
export function defer_render(WrappedComponent) {
  class DeferredRenderWrapper extends React.PureComponent<any, State> {
    constructor(props, context) {
      super(props, context);
      this.state = { should_render: false };
    }

    componentDidMount() {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() =>
          this.setState({ should_render: true })
        );
      });
    }

    render() {
      return this.state.should_render ? (
        <WrappedComponent {...this.props} />
      ) : null;
    }
  }
  return hoistStatics(DeferredRenderWrapper, WrappedComponent);
}
