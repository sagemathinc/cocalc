// cSpell:ignore collabs

import type { TourProps } from "antd";
import { Button, Tour } from "antd";
import { useState } from "react";

import { redux, useRedux } from "@cocalc/frontend/app-framework";
import { A } from "@cocalc/frontend/components/A";
import { Icon } from "@cocalc/frontend/components/icon";
import { SiteName } from "@cocalc/frontend/customize";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import track from "@cocalc/frontend/user-tracking";
import { COLORS } from "@cocalc/util/theme";
import collabsImage from "./tour-collabs.png";
import projectsImage from "./tour-projects.png";

export default function ProjectsPageTour({
  searchRef,
  filtersRef,
  projectListRef,
  createNewRef,
  filenameSearchRef,
  style,
}) {
  const tours = useRedux("account", "tours");
  const [open, setOpen] = useState<boolean>(false);
  if (IS_MOBILE || tours?.includes("all") || tours?.includes("projects")) {
    return null;
  }
  const steps: TourProps["steps"] = [
    {
      title: (
        <>
          <Icon name="edit" /> The Projects Page{" "}
          <A href="https://doc.cocalc.com/project-list.html">(docs)</A>
        </>
      ),
      cover: <img src={projectsImage} />,
      description: (
        <div>
          Welcome to <SiteName />
          's Projects Page! It gives you an overview about all your workspaces,
          where you have access to.
        </div>
      ),
    },
    {
      title: (
        <>
          <Icon name="plus-circle" /> Create Projects
        </>
      ),
      description: (
        <div>
          Click the "Create Project" button to instantiate a new workspace. You
          can specify the project's title, and customize the image and license.
        </div>
      ),
      target: () => createNewRef.current,
    },
    {
      title: (
        <>
          <Icon name="edit" /> Project List
        </>
      ),
      description: (
        <div>
          <p>
            The core of the projects page is the list of your projects. Each
            project is a separate workspace containing files, data, and settings
            specific to that project. By organizing your work into projects, you
            can easily collaborate with others, manage your files, and maintain
            different environments for various projects.
          </p>
          <p>
            At a glance, you can view important information about each project
            like its description, run state, the last time it was edited, and
            the collaborators involved. An avatar or a color makes it easier to
            recognize.
          </p>
          <p>
            Finally,{" "}
            <Icon name="star-filled" style={{ color: COLORS.YELL_L }} />
            -star a project to add it to the quick access row at the top!
          </p>
        </div>
      ),
      target: () => projectListRef.current,
    },

    {
      title: (
        <>
          <Icon name="search" /> Search and Filter
        </>
      ),
      description: (
        <div>
          <p>
            When you're working on multiple projects, the search functionality
            helps in locating projects on your list quickly. By utilizing
            hashtags in project titles or descriptions, you can quickly locate
            and filter through projects. The search box above allows you to use
            regular expressions and negation to further narrow down your search
            results. This allows you to easily identify and remove unnecessary
            projects, as well as start and stop matching projects with ease.
          </p>
        </div>
      ),
      target: () => searchRef.current,
    },

    {
      title: "Hidden and Deleted projects",
      description: (
        <>
          <p>
            Hidden and deleted projects in CoCalc allow you to maintain an
            organized and efficient workspace by selectively displaying relevant
            projects and removing outdated ones. Utilize hidden projects to
            declutter your project list, while deleted projects help manage
            storage capacity and prioritize essential work.
          </p>
          <p>
            Clicking the checkbox shows only deleted projects. When you delete a
            project, it is only permanently deleted after 30 days so you have a
            chance to undelete it here.
          </p>
        </>
      ),
      target: () => filtersRef.current,
    },
    {
      title: (
        <>
          <Icon name="users" /> Collaborators & Sharing
        </>
      ),
      cover: <img src={collabsImage} />,
      description: (
        <div>
          Expand a project via the <Icon name="plus-square" /> icon to see and
          control collaborators on the project. Collaborators can view, edit,
          and run calculations in realtime inside the project – just like you!
        </div>
      ),
    },
    {
      title: "Filename Search",
      target: () => filenameSearchRef.current,
      description: (
        <div>
          This search box helps you to find a file you've worked on in the past.
          It searches through filenames across projects.
        </div>
      ),
    },
    {
      title: "Thanks!",
      description: (
        <>
          The <SiteName /> projects page offers an easy-to-use interface that
          simplifies project management, collaboration, and organization.
          <br />
          <br />
          <Button
            type="primary"
            icon={<Icon name="check" />}
            onClick={() => {
              const actions = redux.getActions("account");
              actions.setTourDone("projects");
            }}
          >
            Hide tour
          </Button>
        </>
      ),
    },
  ];
  return (
    <>
      <Button
        type="dashed"
        style={style}
        onClick={() => {
          setOpen(true);
          track("tour", { name: "projects" });
        }}
      >
        <Icon name="map" /> Tour
      </Button>
      <Tour
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        steps={steps}
      />
    </>
  );
}
