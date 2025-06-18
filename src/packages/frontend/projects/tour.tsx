import { redux, useRedux } from "@cocalc/frontend/app-framework";
import { A } from "@cocalc/frontend/components/A";
import { Icon } from "@cocalc/frontend/components/icon";
import { SiteName } from "@cocalc/frontend/customize";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import track from "@cocalc/frontend/user-tracking";
import type { TourProps } from "antd";
import { Button, Checkbox, Space, Tour } from "antd";
import { useState } from "react";
import collabsImage from "./tour-collabs.png";
import infoImage from "./tour-info.png";
import projectsImage from "./tour-projects.png";

export default function ProjectsPageTour({
  searchRef,
  filtersRef,
  projectListRef,
  createNewRef,
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
          's Projects Page! On this page, you'll find several key elements that
          help you manage and organize your computational work, collaborate with
          others, and maximize your productivity. Let's take a tour and
          highlight these elements.
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
          To start your work on <SiteName />, click the "Create Project" button.
          You can specify the project's title, and customize the image and
          license. Create as many projects as you want!
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
      cover: <img src={infoImage} />,
      description: (
        <div>
          <p>
            The core of the projects page is the list of your projects. Each
            project is a separate folder containing files, data, and settings
            specific to that project. By organizing your work into projects, you
            can easily collaborate with others, manage your files, and maintain
            different environments for various projects.
          </p>
          <p>
            At a glance, you can view important information about each project
            like a short description, the last time it was edited, and the
            collaborators involved. This allows you to quickly understand the
            project's purpose and gauge its progress.
          </p>
        </div>
      ),
      target: () => projectListRef.current,
    },

    {
      title: (
        <>
          <Icon name="search" /> Search
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
      title: (
        <>
          <Icon name="users" /> Collaborators & Sharing
        </>
      ),
      cover: <img src={collabsImage} />,
      description: (
        <div>
          Working together is at the heart of <SiteName />. Easily add
          collaborators to your projects by clicking on the collaborator toggle
          to the right of each project's description. Collaborators can view,
          edit, and run calculations in realtime inside the project.
        </div>
      ),
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
      title: "Thanks!",
      description: (
        <>
          The <SiteName /> projects page offers an easy-to-use interface that
          simplifies project management, collaboration, and organization.
          <br />
          <br />
          <Checkbox
            onChange={(e) => {
              const actions = redux.getActions("account");
              if (e.target.checked) {
                actions.setTourDone("projects");
              } else {
                actions.setTourNotDone("projects");
              }
            }}
          >
            Hide tour
          </Checkbox>
        </>
      ),
    },
  ];
  return (
    <div>
      <Space.Compact style={style}>
        <Button
          type="primary"
          onClick={() => {
            setOpen(true);
            track("tour", { name: "projects" });
          }}
        >
          <Icon name="map" /> Tour
        </Button>
      </Space.Compact>
      <Tour
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        steps={steps}
      />
    </div>
  );
}
