/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Paragraph, Title } from "@cocalc/frontend/components";

interface Props {
  project_id: string;
}

export function ProjectServers(props: Props) {
  const { project_id } = props;

  return (
    <div>
      <Title level={2}>Servers</Title>
      <Paragraph>
        <b>TODO {project_id}</b>
      </Paragraph>
    </div>
  );
}
