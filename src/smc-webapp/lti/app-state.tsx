import * as React from "react";
//import { GlobalState } from "./types";

interface Props {
  debug: boolean;
}

// MOCK DATA
import { MOCK_PROJECTS } from "./DUMMY-DATA";

const ROUTES = {
  HOME: "project-selection"
};

export class AppState extends React.Component<Props> {
  constructor(props) {
    super(props);
    this.state = {
      projects: MOCK_PROJECTS,
      route: ROUTES.HOME
    };
  }

  setAppState(updater: (state, props) => {}, callback) {
    this.setState(updater, () => {
      if (this.props.debug) {
        console.log("setAppState", JSON.stringify(this.state));
      }
      if (callback) {
        callback();
      }
    });
  }

  render() {
    return (
      <div className="AppState">
        {React.Children.map(this.props.children, child => {
          if (React.isValidElement(child)) {
            return React.cloneElement<any>(child, {
              appState: this.state,
              setAppState: this.setAppState
            });
          }
        })}
      </div>
    );
  }
}
