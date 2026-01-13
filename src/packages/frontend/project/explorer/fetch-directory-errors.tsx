/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import ShowError from "@cocalc/frontend/components/error";
import { AccessErrors } from "./access-errors";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { useIntl } from "react-intl";
import { labels } from "@cocalc/frontend/i18n";

interface Props {
  error: any;
  path: string;
  quotas: any;
  is_logged_in: boolean;
}

export function FetchDirectoryErrors({
  error,
  path,
  quotas,
  is_logged_in,
}: Props): React.JSX.Element {
  const intl = useIntl();
  const projectLabel = intl.formatMessage(labels.project);
  const projectLabelLower = projectLabel.toLowerCase();
  const is_commercial = useTypedRedux("customize", "is_commercial");
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
        <ShowError message="Not a folder" error={`${path} is not a folder.`} />
      );
    case "not_running":
      // This shouldn't happen, but due to maybe a slight race condition in the backend it can.
      return (
        <ShowError
          message={`${projectLabel} still not running`}
          error={
            `The ${projectLabelLower} was not running when this listing was requested.  Please try again in a moment.`
          }
        />
      );
    default:
      if (
        error === "no_instance" ||
        (is_commercial &&
          quotas &&
          !quotas.member_host &&
          !`${error}`.includes("EACCES"))
      ) {
        // the second part of the or is to blame it on the free servers, unless EACCESS = read permission error -- see https://github.com/sagemathinc/cocalc/issues/4100
        return (
          <ShowError
            message={`${projectLabel} unavailable`}
            error={`This ${projectLabelLower} seems to not be responding.\n\n${
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
