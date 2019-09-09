import * as React from "react";
import * as ReactDOM from "react-dom";
import styled from "styled-components";
import * as querystring from "query-string";

import {
  BackButton,
  ProjectSelectionPage,
  EntrySelectionPage,
  //SelectedItemsList,
  ConfigurationPage,
  ErrorListing,
  default_colors
} from "./view";
import * as API from "./api";
import { GlobalState, Route } from "./state/types";
import { reducer } from "./state/reducers";
import { initial_global_state } from "./state/values";
import { assert_never } from "./helpers";

// TODO: Put this somewhere ./state
// TODO: Report these errors to some DB
// Returns a shallow copy of global_state with a new context attached via url search query
function with_data_from_params(global_state: GlobalState): GlobalState {
  const query_params = querystring.parse(window.location.search);
  try {
    if (query_params.id_token == undefined) {
      throw new Error("id_token was undefined");
    }
    if (Array.isArray(query_params.id_token)) {
      throw new Error(
        "id_token recieved as an array. Should be a single value"
      );
    }
    if (query_params.nonce == undefined) {
      throw new Error("nonce was undefined");
    }
    if (Array.isArray(query_params.nonce)) {
      throw new Error("nonce recieved as an array. Should be a single value");
    }
    if (Array.isArray(query_params.return_path)) {
      throw new Error(
        "return_path recieved as an array. Should be a single value"
      );
    }
    if (query_params.return_path == undefined) {
      throw new Error("return_path was undefined");
    }
  } catch (e) {
    return {
      ...global_state,
      errors: [...global_state.errors, e]
    };
  }

  return {
    ...global_state,
    context: {
      id_token: query_params.id_token,
      nonce: query_params.nonce,
      return_path: query_params.return_path
    }
  };
}

function App() {
  const [state, dispatch] = React.useReducer(
    reducer,
    initial_global_state,
    with_data_from_params
  );

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

  if (state.errors.length > 0) {
    content = <ErrorListing errors={state.errors} />;
  } else if (!state.loading && state.account_info) {
    switch (state.route) {
      case Route.Home:
        content = (
          <ProjectSelectionPage
            projects={state.projects}
            account_id={state.account_info.account_id}
            dispatch={dispatch}
          />
        );
        break;
      case Route.Project:
        content = (
          <EntrySelectionPage
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
      case Route.Configure:
        content = (
          <ConfigurationPage
            project_id={state.opened_project_id}
            selected_entries={state.selected_entries[state.opened_project_id]}
            excluded_entries={state.excluded_entries[state.opened_project_id]}
            context={state.context}
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

  // TODO: Build header more intelligently
  let header = "Cocalc";
  const project_title = state.opened_project_id
    ? state.projects[state.opened_project_id].title
    : "";
  if (project_title) {
    header += ` > ${project_title}`;
  }
  if (state.route === Route.Configure) {
    header += ` > Finalizing`;
  }

  return (
    <Grid>
      <HeaderContainer>{header}</HeaderContainer>
      <LeftGutterContainer>
        {state.route !== Route.Home && (
          <BackButton
            on_click={_ => dispatch({ type: "back_button_clicked" })}
          />
        )}
      </LeftGutterContainer>
      <ContentContainer>{content}</ContentContainer>
      <RightGutterContainer />
      <FooterContainer />
    </Grid>
  );
}

const Grid = styled.div`
  background-color: ${default_colors.background_color};
  color: ${default_colors.color};
  display: grid;
  font-size: 1.5rem;
  grid-template-columns: 8% auto 8%;
  grid-template-rows: 2rem auto 0rem;
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
  place-self: center;
  overflow: scroll;
`;

const ContentContainer = styled.div`
  grid-area: content;
  overflow: scroll;
`;

const RightGutterContainer = styled.div`
  grid-area: right-gutter;
  place-self: center;
  overflow: scroll;
`;

const FooterContainer = styled.div`
  grid-area: footer;
  overflow: hidden;
  background: skyblue;
`;

export function render_app() {
  ReactDOM.render(<App />, document.getElementById("cocalc-react-container"));
}
