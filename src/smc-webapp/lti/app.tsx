import * as React from "react";
import * as ReactDOM from "react-dom";
import styled from "styled-components";
import { ProjectSelection } from "./project-selection";
import * as API from "./api";
import { AccountInfo, Actions, GlobalState, ProjectInfo, Route } from "./state/types";
import { reducer } from "./state/reducers";

import * as MOCK from "./DUMMY-DATA";

function App({ debug }: { debug?: boolean } = { debug: false }) {
  if (debug) {
    console.log("Rendering App");
  }

  const [state, dispatch] = React.useReducer(reducer, {
    projects: [],
    route: Route.Home,
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
  if (!state.loading && state.account_info) {
    switch (state.route) {
      case Route.Home:
        content = (
          <ProjectSelection
            projects={state.projects || []}
            account_id={state.account_info.account_id}
          />
        );
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
      <FooterContainer>Footer....</FooterContainer>
    </Grid>
  );
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: 25% 50% 25%;
  grid-template-rows: 80px auto 20px;
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

const FooterContainer = styled.div`
  grid-area: footer;
  oferflow: hidden;
  background: darkorange;
`;

export function render_app() {
  ReactDOM.render(<App />, document.getElementById("cocalc-react-container"));
}
