import * as React from "react";
import * as ReactDOM from "react-dom";
import styled from "styled-components";
import { ProjectSelection } from "./project-selection";
import * as API from "./actions";
import { AccountInfo, ProjectInfo } from "./types";

import * as MOCK from "./DUMMY-DATA";

interface Props {
  debug: boolean;
}

interface State {
  route: string;
  projects: ProjectInfo[];
  account_info: AccountInfo;
}

const ROUTES = {
  HOME: "project-selection"
};

class App extends React.Component<Props, State> {
  constructor(props) {
    super(props);

    this.state = {
      projects: [],
      route: ROUTES.HOME,
      account_info: MOCK.ACCOUNT
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
    const self = await API.fetch_self();
    this.setAppState({ projects: projects, account_info: self });
  }

  render() {
    let content = (
      <>
        The route: {this.state.route} is not yet implemented. Here's the state!
        <br />
        {JSON.stringify(this.state)}
      </>
    );

    switch (this.state.route) {
      case ROUTES.HOME:
        content = <ProjectSelection projects={this.state.projects} />;
    }

    return (
      <Grid>
        <ContentContainer>{content}</ContentContainer>
      </Grid>
    );
  }
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: 25% 50% 25%;
  grid-template-rows: 100px auto 100px;
  grid-template-areas:
    "header header header"
    "left-gutter content right-gutter"
    "footer footer footer";
  width: 100vw;
  height: 100vh;
  overflow: hidden;
`;

const ContentContainer = styled.div`
  grid-area: content;
  overflow: scroll;
`;


export function render_app() {
  ReactDOM.render(<App />, document.getElementById("cocalc-react-container"));
}
