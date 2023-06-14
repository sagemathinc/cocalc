/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

interface LicensesProps {
  project_id: string;
}

export function LicensesFlyout({ project_id }: LicensesProps): JSX.Element {
  return <>licenses of ${project_id}</>;
}
