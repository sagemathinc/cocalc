import * as React from "react";
import * as ReactDOM from "react-dom";
import { AppState } from "./app-state";
import { ProjectSelection } from "./project-selection";

//import { GlobalState } from "./types";

interface Props {
  appState: any;
}
const ROUTES = {
  HOME: "project-selection"
};

class App extends React.Component<Props> {
  constructor(props) {
    super(props);
  }

  static defaultProps = {
    appState: {}
  };

  render() {
    const { appState } = this.props;

    switch (appState.route) {
      case ROUTES.HOME:
        return <ProjectSelection projects={appState.projects} />;
      default:
        return (
          <div>
            The route: {appState.route} is not yet implemented. Here's the
            state!
            <br />
            {JSON.stringify(appState)}
          </div>
        );
    }
  }
}

export function render_app() {
  ReactDOM.render(
    <AppState debug={false}>
      <App />
    </AppState>,
    document.getElementById("cocalc-react-container")
  );
}
