/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

interface CollabsProps {
  project_id: string;
}

export function CollabsFlyout({ project_id }: CollabsProps): JSX.Element {
  return <>collaborators of ${project_id}</>;
}
