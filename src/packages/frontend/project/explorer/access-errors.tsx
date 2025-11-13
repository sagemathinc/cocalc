/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ErrorDisplay } from "@cocalc/frontend/components";
import { AccountPage } from "../../account/account-page";

interface Props {
  is_logged_in: boolean;
}

export function AccessErrors({ is_logged_in }: Props): React.JSX.Element {
  if (is_logged_in) {
    return (
      <ErrorDisplay
        title="Folder is not public"
        error={
          "You are trying to access a non public project that you are not a collaborator on. You need to ask a collaborator of the project to add you."
        }
      />
    );
  } else {
    return (
      <div>
        <ErrorDisplay
          title="Folder is not public"
          error={
            "You are not signed in. If you are collaborator on this project you need to sign in first. This project is not public."
          }
        />
        <AccountPage />
      </div>
    );
  }
}
