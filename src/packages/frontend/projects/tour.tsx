import { useState } from "react";
import { Button, Tour } from "antd";
import type { TourProps } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useRedux } from "@cocalc/frontend/app-framework";

export default function ProjectsPageTour({
  searchRef,
  filtersRef,
  createNewRef,
  style,
}) {
  const tours = useRedux("account", "tours");
  const [open, setOpen] = useState<boolean>(false);
  if (tours?.includes("all") || tours?.includes("projects")) {
    return null;
  }
  const steps: TourProps["steps"] = [
    {
      title: (
        <>
          <Icon name="edit" /> The Projects Page"
        </>
      ),
      description: (
        <div>
          The projects page is the central hub for organizing, creating, and
          managing your projects. A project is an separate collaborative
          workspace containing files and folders. On the projects page, you can
          view the list of all projects you collaborate on, along with their
          title, description, and last modified date.
        </div>
      ),
    },
    {
      title: (
        <>
          <Icon name="plus-circle" /> Creating New Projects
        </>
      ),
      description: (
        <div>
          You can easily create a new project by clicking the "Create Project"
          button, which lets you enter a title, and customize the image and
          license. You can freely create as many projects as you want at any
          time.
        </div>
      ),
      target: () => createNewRef.current,
    },
    {
      title: (
        <>
          <Icon name="search" /> Search for projects
        </>
      ),
      description:
        "Search through all projects here.  You can search by title, description, #tags, and collaborator names. You can use regular expressions in your search. Try typing something in the box above and the list of projects will immediately shrink to show only matches.  Also, buttons appear that let you remove yourself, delete and hide projects, and stop and start the matching projects.",
      target: () => searchRef.current,
    },
    {
      title: "Deleted or Hidden projects",
      description: "",
      target: () => filtersRef.current,
    },
  ];
  return (
    <div>
      <Button.Group style={style}>
        <Button type="primary" onClick={() => setOpen(true)}>
          <Icon name="map" /> Tour
        </Button>
      </Button.Group>
      <Tour
        open={open}
        onClose={() => {
          console.log("clicked on close");
          setOpen(false);
        }}
        steps={steps}
      />
    </div>
  );
}
