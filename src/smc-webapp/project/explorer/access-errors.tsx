import * as React from "react";
import { ErrorDisplay } from "smc-webapp/r_misc";
const { AccountPage } = require("../../account_page");

interface Props {
  public_view: boolean;
  is_logged_in: boolean;
}

export function AccessErrors({ public_view, is_logged_in }: Props): JSX.Element {
  if (public_view) {
    if (is_logged_in) {
      return (
        <ErrorDisplay
          style={{ maxWidth: "100%" }}
          bsStyle="warning"
          title="Showing only public files"
          error={
            "You are viewing a project that you are not a collaborator on. To view non-public files or edit files in this project you need to ask a collaborator of the project to add you."
          }
        />
      );
    } else {
      return (
        <div>
          <ErrorDisplay
            style={{ maxWidth: "100%" }}
            bsStyle="warning"
            title="Showing only public files"
            error={
              "You are not logged in. To view non-public files or edit files in this project you will need to sign in. If you are not a collaborator then you need to ask a collaborator of the project to add you to access non public files."
            }
          />
        </div>
      );
    }
  } else {
    if (is_logged_in) {
      return (
        <ErrorDisplay
          title="Directory is not public"
          error={
            "You are trying to access a non public project that you are not a collaborator on. You need to ask a collaborator of the project to add you."
          }
        />
      );
    } else {
      return (
        <div>
          <ErrorDisplay
            title="Directory is not public"
            error={
              "You are not signed in. If you are collaborator on this project you need to sign in first. This project is not public."
            }
          />
          <AccountPage />
        </div>
      );
    }
  }
}
