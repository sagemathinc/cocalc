/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import ShowError from "@cocalc/frontend/components/error";
import { AccessErrors } from "./access-errors";

interface Props {
  error: any;
  path: string;
  quotas: any;
  is_commercial: boolean;
  is_logged_in: boolean;
}

export function FetchDirectoryErrors({
  error,
  path,
  quotas,
  is_commercial,
  is_logged_in,
}: Props): JSX.Element {
  switch (error) {
    case "not_public":
      return <AccessErrors is_logged_in={is_logged_in} />;
    case "no_dir":
      return (
        <ShowError
          message="No such folder"
          error={`The path ${path} does not exist.`}
        />
      );
    case "not_a_dir":
      return (
        <ShowError
          message="Not a folder"
          error={`${path} is not a folder.`}
        />
      );
    case "not_running":
      // This shouldn't happen, but due to maybe a slight race condition in the backend it can.
      return (
        <ShowError
          message="Project still not running"
          error={
            "The project was not running when this listing was requested.  Please try again in a moment."
          }
        />
      );
    default:
      if (
        error === "no_instance" ||
        (is_commercial && quotas && !quotas.member_host)
      ) {
        // the second part of the or is to blame it on the free servers...
        return (
          <ShowError
            message="Project unavailable"
            error={`This project seems to not be responding.   Free projects are hosted on massively overloaded computers, which are rebooted at least once per day and periodically become unavailable.   To increase the robustness of your projects, please become a paying customer (US $14/month) by entering your credit card in the Billing tab next to account settings, then move your projects to a members only server. \n\n${
              !(quotas != undefined ? quotas.member_host : undefined)
                ? error
                : undefined
            }`}
          />
        );
      } else {
        return <ShowError message="Folder Listing Error" error={error} />;
      }
  }
}
