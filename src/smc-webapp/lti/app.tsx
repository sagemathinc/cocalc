import * as React from "react";
import * as ReactDOM from "react-dom";
import styled from "styled-components";
import { ProjectSelector, ProjectDisplay, SelectedItemsList } from "./view";
import * as API from "./api";
import { Route } from "./state/types";
import { reducer } from "./state/reducers";
import { initial_global_state } from "./state/values";
import { assert_never } from "./helpers";

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

  let header = <>Loading user</>;
  let left_gutter = <>Nothing here</>;
  let right_gutter = <>Loading stuff</>;
  let content = (
    <>
      The route: {state.route} is not yet implemented. Here's the state!
      <br />
      {JSON.stringify(state)}
    </>
  );

  if (!state.loading && state.account_info) {
    header = <>User: {state.account_info.first_name || "No user name"}</>;

    right_gutter = (
      <SelectedItemsList
        selected_entries={state.selected_entries}
        on_entry_removal_clicked={path => {
          console.log("need to remove:", path);
        }}
        projects={state.projects}
      />
    );

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
          <ProjectDisplay
            projects={state.projects}
            opened_project_id={state.opened_project_id}
            file_listings={state.file_listings[state.opened_project_id]}
            current_path={state.current_path}
            selected_entries={state.selected_entries[state.opened_project_id]}
            dispatch={dispatch}
          />
        );
        left_gutter = (
          <ProjectSelector
            projects={state.projects}
            account_id={state.account_info.account_id}
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
      <HeaderContainer>{header}</HeaderContainer>
      <LeftGutterContainer>{left_gutter}</LeftGutterContainer>
      <ContentContainer>{content}</ContentContainer>
      <RightGutterContainer>{right_gutter}</RightGutterContainer>
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

const LeftGutterContainer = styled.div`
  grid-area: left-gutter;
  background: mistyrose;
  overflow: scroll;
`;

const ContentContainer = styled.div`
  grid-area: content;
  overflow: scroll;
`;

const RightGutterContainer = styled.div`
  grid-area: right-gutter;
  background: mistyrose;
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
