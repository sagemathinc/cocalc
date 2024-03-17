/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List } from "antd";
import VirtualList from "rc-virtual-list";
import { Virtuoso } from "react-virtuoso";

import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { LoadAllProjects } from "./load-all";
import { ProjectRow } from "./project-row";

interface Props {
  visible_projects: string[]; // array of project ids
}

export default function ProjectList({ visible_projects }: Props) {
  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: `project-list-${visible_projects.length}`,
  });

  return (
    <Virtuoso
      {...virtuosoScroll}
      totalCount={visible_projects.length + 1}
      itemContent={(index) => {
        if (index == visible_projects.length) {
          return (
            // div is needed to avoid height 0 when projects already loaded.
            <div style={{ minHeight: "1px" }}>
              <LoadAllProjects />
            </div>
          );
        }
        const project_id = visible_projects[index];
        if (project_id == null) {
          // should not happen
          return <div style={{ height: "1px" }}></div>;
        }
        return (
          <ProjectRow project_id={project_id} key={project_id} index={index} />
        );
      }}
    />
  );
}

interface Props2 {
  visible_projects: string[]; // array of project ids
  header: React.ReactNode;
  height: number;
}

export function ProjectsList2({ visible_projects, header, height }: Props2) {
  const data = visible_projects.map((project_id, index) => ({
    index,
    project_id,
  }));
  data.push({ index: data.length, project_id: "" });

  function renderProjectRow({ index, project_id }) {
    return (
      <List.Item key={index} actions={[<div>action</div>]}>
        <List.Item.Meta
          avatar={<div>avatar</div>}
          title="title"
          description="desc"
        />
        <div>
          content: {project_id} {index}
        </div>
      </List.Item>
    );
  }

  return (
    <List bordered={false} style={{ outline: "1px solid red" }} header={header}>
      <VirtualList
        data={data}
        height={height - 20}
        itemHeight={100}
        itemKey="project_id"
      >
        {({ project_id, index }) => {
          if (index == visible_projects.length) {
            return (
              // div is needed to avoid height 0 when projects already loaded.
              <div key={index} style={{ minHeight: "1px" }}>
                <LoadAllProjects />
              </div>
            );
          }

          // should not happen
          if (!project_id) {
            return <div key={index} style={{ height: "1px" }}></div>;
          }

          return renderProjectRow({ index, project_id });
        }}
      </VirtualList>
    </List>
  );
}
