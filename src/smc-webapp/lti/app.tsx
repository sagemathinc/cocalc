import * as React from "react";
import * as ReactDOM from "react-dom";
import styled from "styled-components";
import * as querystring from "query-string";

import {
  ProjectSelector,
  ProjectContainer,
  //SelectedItemsList,
  NameAssignment
} from "./view";
import * as API from "./api";
import { Route } from "./state/types";
import { reducer } from "./state/reducers";
import { initial_global_state } from "./state/values";
import { assert_never } from "./helpers";

const QUERY_PARAMS = querystring.parse(window.location.search);
console.log("Params", QUERY_PARAMS);

function App() {
  const [state, dispatch] = React.useReducer(reducer, initial_global_state);

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
          <ProjectSelector
            projects={state.projects}
            account_id={state.account_info.account_id}
            dispatch={dispatch}
          />
        );
        break;
      case Route.Project:
        content = (
          <ProjectContainer
            project_id={state.opened_project_id}
            projects={state.projects}
            current_path={state.current_path}
            file_listings={state.file_listings[state.opened_project_id]}
            opened_directories={
              state.opened_directories[state.opened_project_id]
            }
            selected_entries={state.selected_entries[state.opened_project_id]}
            excluded_entries={state.excluded_entries[state.opened_project_id]}
            dispatch={dispatch}
          />
        );
        break;
      default:
        assert_never(state.route);
    }
  } else if (!state.loading && !state.account_info) {
    content = (
      <div>Stuff returned but account_info is undefined. Check logs</div>
    );
  } else {
    content = <div>Loading...</div>;
  }

  return (
    <Grid>
      <HeaderContainer />
      <LeftGutterContainer />
      <ContentContainer>{content}</ContentContainer>
      <RightGutterContainer />
      <FooterContainer>
        <form method="post" action={"lti/return-deep-link"}>
          <input
            type="hidden"
            name="token_id"
            value={QUERY_PARAMS.id_token || ""}
          />
          <button type="submit" name="state" value={QUERY_PARAMS.state || ""}>
            This is a link that sends a POST request
          </button>
        </form>
      </FooterContainer>
    </Grid>
  );
}

const Grid = styled.div`
  display: grid;
  font-size: 24px;
  grid-template-columns: 15% auto 15%;
  grid-template-rows: 80px auto 80px;
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
`;

const LeftGutterContainer = styled.div`
  grid-area: left-gutter;
  overflow: scroll;
`;

const ContentContainer = styled.div`
  grid-area: content;
  overflow: scroll;
`;

const RightGutterContainer = styled.div`
  grid-area: right-gutter;
  overflow: scroll;
`;

const FooterContainer = styled.div`
  grid-area: footer;
  oferflow: hidden;
`;

export function render_app() {
  ReactDOM.render(<App />, document.getElementById("cocalc-react-container"));
}
