// Root component to only show a single file editor

import {
  React,
  ReactDOM,
  // rclass,
  // redux,
  Rendered,
  Component
  // rtypes,
  // Redux,
  // redux_fields
} from "./app-framework";

import { Loading } from "./r_misc/loading";

// const misc = require("smc-util/misc");

const { AppLogo } = require("./app_shared");

const page_style: React.CSSProperties = {
  height: "100vh",
  width: "100vw",
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  background: "white"
};

interface SinglePageProps {}

class SinglePageComponent extends Component<SinglePageProps> {
  render(): Rendered {
    return (
      <div ref="page" style={page_style}>
        <AppLogo /> single page <Loading />
      </div>
    );
  }
}

// const SinglePage = rclass<SinglePageProps>(SinglePageComponent);

export function render() {
  ReactDOM.render(
    SinglePageComponent,
    document.getElementById("smc-react-container")
  );
}
