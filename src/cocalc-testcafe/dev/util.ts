/*
Utility functions for testing the cocalc dev servers from within a cocalc project.
*/

const { readFileSync } = require("fs");

export function project_id(): string {
  return process.env.COCALC_PROJECT_ID;
}

export function service_port(service : string ): number {
  return readFileSync(`${__dirname}/../../dev/project/ports/${service}`).toString().trim()
}

export function hub_url(): string {
  const port = service_port('hub');
  return `http://localhost:${port}/${project_id()}/port/${port}/`;
}

export function app_url(): string {
  //return `${hub_url()}/app`
  return "https://cocalc.com/app";
}


export function share_url(): string {
  const port = service_port('hub-share-2');
  return `http://localhost:${port}/${project_id()}/port/${port}/`;
}
