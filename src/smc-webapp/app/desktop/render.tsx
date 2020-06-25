import { ErrorBoundary } from "../../r_misc";
import { React, ReactDOM, Redux } from "../../app-framework";
import { Page } from "./page";

export function render(): void {
  ReactDOM.render(
    <Redux>
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>
    </Redux>,
    document.getElementById("smc-react-container")
  );
}
