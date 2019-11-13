import * as React from "react";
import { ErrorDisplay } from "smc-webapp/r_misc";
import { AccessErrors } from "./access-errors";

interface Props {
  error: any;
  path: string;
  quotas: any;
  is_commercial: boolean;
  public_view: boolean;
  is_logged_in: boolean;
}

export function FetchDirectoryErrors({
  error,
  path,
  quotas,
  is_commercial,
  public_view,
  is_logged_in
}: Props): JSX.Element {
  switch (error) {
    case "not_public":
      return (
        <AccessErrors public_view={public_view} is_logged_in={is_logged_in} />
      );
    case "no_dir":
      return (
        <ErrorDisplay
          title="No such directory"
          error={`The path ${path} does not exist.`}
        />
      );
    case "not_a_dir":
      return (
        <ErrorDisplay
          title="Not a directory"
          error={`${path} is not a directory.`}
        />
      );
    case "not_running":
      // This shouldn't happen, but due to maybe a slight race condition in the backend it can.
      return (
        <ErrorDisplay
          title="Project still not running"
          error={
            "The project was not running when this directory listing was requested.  Please try again in a moment."
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
          <ErrorDisplay
            title="Project unavailable"
            error={`This project seems to not be responding.   Free projects are hosted on massively overloaded computers, which are rebooted at least once per day and periodically become unavailable.   To increase the robustness of your projects, please become a paying customer (US $14/month) by entering your credit card in the Billing tab next to account settings, then move your projects to a members only server. \n\n${
              !(quotas != undefined ? quotas.member_host : undefined)
                ? error
                : undefined
            }`}
          />
        );
      } else {
        return <ErrorDisplay title="Directory listing error" error={error} />;
      }
  }
}
