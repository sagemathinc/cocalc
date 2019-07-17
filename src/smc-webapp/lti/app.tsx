import * as React from "react";
import * as ReactDOM from "react-dom";
import styled from "styled-components";
import { ProjectSelection } from "./project-selection";
import * as API from "./api";
import { AccountInfo, ProjectInfo } from "./types";

import * as MOCK from "./DUMMY-DATA";

interface State {
  route: string;
  projects: ProjectInfo[];
  account_info?: AccountInfo;
  loading: boolean;
}

type Action =
  | {
      type: "initial_load";
      projects?: ProjectInfo[];
      account_info?: AccountInfo;
    }
  | { type: "set_projects"; projects: ProjectInfo[] }
  | { type: "set_account_info"; account_info: AccountInfo }
  | { type: "change_route"; route: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "initial_load":
      return {
        ...state,
        projects: action.projects || [],
        account_info: action.account_info,
        loading: false
      };
    case "set_projects":
      return { ...state, projects: action.projects };
    case "set_account_info":
      return { ...state, account_info: action.account_info };
    case "change_route":
      return { ...state, route: action.route };
    default:
      throw new Error();
  }
}

const ROUTES = {
  HOME: "project-selection"
};

function App({ debug }: { debug?: boolean } = { debug: false }) {
  if (debug) {
    console.log("Rendering App");
  }

  const [state, dispatch] = React.useReducer(reducer, {
    projects: [],
    route: ROUTES.HOME,
    account_info: MOCK.ACCOUNT,
    loading: true
  });

  React.useEffect(() => {
    const fetchData = async () => {
      const projects = await API.fetch_projects();
      const account_info = await API.fetch_self();
      dispatch({
        type: "initial_load",
        projects,
        account_info
      });
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

  let header = (
    <>
      User:{" "}
      {(state.account_info && state.account_info.first_name) || "No user name"}
    </>
  );

  return (
    <Grid>
      <HeaderContainer>{header}</HeaderContainer>
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

const HeaderContainer = styled.div`
  grid-area: header;
  overflow: hidden;
  background: skyblue;
`;

const ContentContainer = styled.div`
  grid-area: content;
  overflow: scroll;
`;

export function render_app() {
  ReactDOM.render(<App />, document.getElementById("cocalc-react-container"));
}
