import * as React from "react";
import * as ReactDOM from "react-dom";
import { ProjectSelection } from "./project-selection";
import * as API from "./actions";

// MOCK DATA
import { MOCK_PROJECTS } from "./DUMMY-DATA";

interface Props {
  debug: boolean;
}

interface State {
  route: string;
  projects: { project_id: string; title: string; description: string }[];
}

const ROUTES = {
  HOME: "project-selection"
};

class App extends React.Component<Props, State> {
  constructor(props) {
    super(props);

    this.state = {
      projects: MOCK_PROJECTS,
      route: ROUTES.HOME
    };

    this.setAppState = this.setAppState.bind(this);
  }

  static defaultProps = {
    debug: false
  };

  setAppState(updater, callback?) {
    this.setState(updater, () => {
      if (this.props.debug) {
        console.log("setAppState", JSON.stringify(this.state));
      }
      if (callback) {
        callback();
      }
    });
  }

  async componentDidMount() {
    const projects = await API.fetch_projects();
    this.setAppState({ projects: projects });
  }

  render() {
    switch (this.state.route) {
      case ROUTES.HOME:
        return <ProjectSelection projects={this.state.projects} />;
      default:
        return (
          <div>
            The route: {this.state.route} is not yet implemented. Here's the
            state!
            <br />
            {JSON.stringify(this.state)}
          </div>
        );
    }
  }
}

export function render_app() {
  ReactDOM.render(<App />, document.getElementById("cocalc-react-container"));
}
