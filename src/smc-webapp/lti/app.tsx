import * as React from "react";
import * as ReactDOM from "react-dom";
import styled from "styled-components";
import { ProjectSelection } from "./project-selection";
import * as API from "./actions";
import { AccountInfo, ProjectInfo } from "./types";

import * as MOCK from "./DUMMY-DATA";

interface State {
  route: string;
  projects?: ProjectInfo[];
  account_info?: AccountInfo;
  loading: boolean;
}

const ROUTES = {
  HOME: "project-selection"
};

function App({ debug }: { debug?: boolean } = { debug: false }) {
  if (debug) {
    console.log("Rendering App");
  }

  const [state, setAppState] = React.useState<State>({
    projects: [],
    route: ROUTES.HOME,
    account_info: MOCK.ACCOUNT,
    loading: true
  });

  React.useEffect(() => {
    const fetchData = async () => {
      const projects = await API.fetch_projects();
      const account_info = await API.fetch_self();
      setAppState({ ...state, projects, account_info, loading: false });
    };

    fetchData();
  }, []);

  let content = (
    <>
      The route: {state.route} is not yet implemented. Here's the state!
      <br />
      {JSON.stringify(state)}
    </>
  );
  if (!state.loading) {
    switch (state.route) {
      case ROUTES.HOME:
        content = <ProjectSelection projects={state.projects || []} />;
    }
  } else {
    content = <div>Loading...</div>;
  }

  return (
    <Grid>
      <ContentContainer>{content}</ContentContainer>
    </Grid>
  );
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
