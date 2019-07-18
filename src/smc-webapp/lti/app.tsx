import * as React from "react";
import * as ReactDOM from "react-dom";
import styled from "styled-components";
import { ProjectSelection } from "./project-selection";
import * as API from "./api";
import { Route } from "./state/types";
import { reducer } from "./state/reducers";
import { assert_never } from "./helpers";

function App() {
  const [state, dispatch] = React.useReducer(reducer, {
    projects: [],
    route: Route.Home,
    account_info: undefined,
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

  let header = <> Loading user </>;

  let content = (
    <>
      The route: {state.route} is not yet implemented. Here's the state!
      <br />
      {JSON.stringify(state)}
    </>
  );

  if (!state.loading && state.account_info) {
    header = <>User: {state.account_info.first_name || "No user name"}</>;

    switch (state.route) {
      case Route.Home:
        content = (
          <ProjectSelection
            projects={state.projects || []}
            account_id={state.account_info.account_id}
            dispatch={dispatch}
          />
        );
        break;
      case Route.Project:
        content = <>{state.opened_project}</>;
        break;
      default:
        assert_never(state.route);
    }
  } else {
    content = <div>Loading...</div>;
  }

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
