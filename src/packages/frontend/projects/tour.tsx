// cSpell:ignore collabs

import type { TourProps } from "antd";
import { Button, Tour } from "antd";
import { useState } from "react";
import { useIntl } from "react-intl";

import { redux, useRedux } from "@cocalc/frontend/app-framework";
import { A } from "@cocalc/frontend/components/A";
import { Icon } from "@cocalc/frontend/components/icon";
import { SiteName } from "@cocalc/frontend/customize";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { labels } from "@cocalc/frontend/i18n";
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
  const intl = useIntl();
  const projectLabel = intl.formatMessage(labels.project);
  const projectsLabel = intl.formatMessage(labels.projects);
  const projectLabelLower = projectLabel.toLowerCase();
  const projectsLabelLower = projectsLabel.toLowerCase();
  if (IS_MOBILE || tours?.includes("all") || tours?.includes("projects")) {
    return null;
  }
  const steps: TourProps["steps"] = [
    {
      title: (
        <>
          <Icon name="edit" /> The {projectsLabel} Page{" "}
          <A href="https://doc.cocalc.com/project-list.html">(docs)</A>
        </>
      ),
      cover: <img src={projectsImage} />,
      description: (
        <div>
          Welcome to <SiteName />
          's {projectsLabel} Page! It gives you an overview about all your{" "}
          workspaces, where you have access to.
        </div>
      ),
    },
    {
      title: (
        <>
          <Icon name="plus-circle" /> Create {projectsLabel}
        </>
      ),
      description: (
        <div>
          Click the "Create {projectLabel}" button to instantiate a new
          workspace. You can specify the {projectLabelLower}'s title, and
          customize the image and license.
        </div>
      ),
      target: () => createNewRef.current,
    },
    {
      title: (
        <>
          <Icon name="edit" /> {projectLabel} List
        </>
      ),
      description: (
        <div>
          <p>
            The core of the {projectsLabelLower} page is the list of your{" "}
            {projectsLabelLower}. Each {projectLabelLower} is a separate
            workspace containing files, data, and settings specific to that{" "}
            {projectLabelLower}. By organizing your work into{" "}
            {projectsLabelLower}, you can easily collaborate with others, manage
            your files, and maintain different environments for various{" "}
            {projectsLabelLower}.
          </p>
          <p>
            At a glance, you can view important information about each{" "}
            {projectLabelLower} like its description, run state, the last time
            it was edited, and the collaborators involved. An avatar or a color
            makes it easier to recognize.
          </p>
          <p>
            Finally,{" "}
            <Icon name="star-filled" style={{ color: COLORS.YELL_L }} />
            -star a {projectLabelLower} to add it to the quick access row at the
            top!
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
            When you're working on multiple {projectsLabelLower}, the search
            functionality helps in locating {projectsLabelLower} on your list
            quickly. By utilizing hashtags in {projectLabelLower} titles or
            descriptions, you can quickly locate and filter through{" "}
            {projectsLabelLower}. The search box above allows you to use regular
            expressions and negation to further narrow down your search results.
            This allows you to easily identify and remove unnecessary{" "}
            {projectsLabelLower}, as well as start and stop matching{" "}
            {projectsLabelLower} with ease.
          </p>
        </div>
      ),
      target: () => searchRef.current,
    },

    {
      title: `Hidden and Deleted ${projectsLabelLower}`,
      description: (
        <>
          <p>
            Hidden and deleted {projectsLabelLower} in CoCalc allow you to
            organized and efficient workspace by selectively displaying relevant
            {projectsLabelLower} and removing outdated ones. Utilize hidden{" "}
            {projectsLabelLower} to declutter your {projectLabelLower} list,
            while deleted {projectsLabelLower} help manage
            storage capacity and prioritize essential work.
          </p>
          <p>
            Clicking the checkbox shows only deleted {projectsLabelLower}. When
            you delete a {projectLabelLower}, it is only permanently deleted
            after 30 days so you have a chance to undelete it here.
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
          Expand a {projectLabelLower} via the <Icon name="plus-square" /> icon
          to see and control collaborators on the {projectLabelLower}.
          Collaborators can view, edit, and run calculations in realtime inside
          the {projectLabelLower} – just like you!
        </div>
      ),
    },
    {
      title: "Filename Search",
      target: () => filenameSearchRef.current,
      description: (
        <div>
          This search box helps you to find a file you've worked on in the past.
          It searches through filenames across {projectsLabelLower}.
        </div>
      ),
    },
    {
      title: "Thanks!",
      description: (
        <>
          The <SiteName /> {projectsLabelLower} page offers an easy-to-use
          interface that simplifies {projectLabelLower} management,
          collaboration, and organization.
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
