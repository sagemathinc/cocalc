import axios from "axios";
import { AccountInfo, DirectoryListing, Projects } from "./state/types";

const config = {
  api_key: "sk_55xJTNDSAez7DNWFI3wV9lZO",
  api_url: "https://cocalc.com/api/v1/"
};

export async function fetch_projects(): Promise<Projects> {
  try {
    const response = await axios({
      method: "post",
      url: config.api_url + "query",
      auth: { username: config.api_key, password: "" },
      data: {
        query: {
          projects: [
            {
              project_id: null,
              title: null,
              description: null,
              deleted: null,
              state: null,
              users: null
            }
          ]
        }
      }
    });
    console.log(`fetch projects api returned:`, response.data);
    const project_map: any = {};
    response.data.query.projects.map(project => {
      project_map[project.project_id] = project;
    });
    return project_map;
  } catch (error) {
    placeholder_error_handling(error);
    return {};
  }
}

// Assumes the query will only ever return one result.
export async function fetch_self(): Promise<AccountInfo | undefined> {
  try {
    const table = "accounts";
    const response = await axios({
      method: "post",
      url: config.api_url + "query",
      auth: { username: config.api_key, password: "" },
      data: {
        query: {
          [table]: [
            {
              account_id: null,
              email_address: null,
              first_name: null,
              last_name: null
            }
          ]
        }
      }
    });
    console.log(`fetch self api returned:`, response.data);

    return response.data.query[table][0];
  } catch (error) {
    placeholder_error_handling(error);
  }
}

// https://doc.cocalc.com/api/project_exec.html
export async function fetch_directory_listing(
  project_id,
  path = "",
  dispatch
): Promise<DirectoryListing> {
  try {
    // TODO: Make sure the project is running first.
    const response = await axios({
      method: "post",
      url: config.api_url + "project_exec",
      auth: { username: config.api_key, password: "" },
      data: {
        project_id: project_id,
        path: path,
        command: "ls",
        args: ["-f", "-F"],
        timeout: 10
      }
    });
    console.log(`fetch directory listing api returned:`, response.data.stdout);
    dispatch({
      type: "add_directory_listing",
      listing: response.data.stdout,
      path: path,
      project_id
    });
    return response.data.stdout;
  } catch (error) {
    placeholder_error_handling(error);
  }
}

function placeholder_error_handling(error) {
  console.log("Some kind of error occurred");
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    console.log(error.response.data);
    console.log(error.response.status);
    console.log(error.response.headers);
    console.log(error.request);
  } else if (error.request) {
    // The request was made but no response was received
    // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
    // http.ClientRequest in node.js
    console.log(error.request);
  } else {
    // Something happened in setting up the request that triggered an Error
    console.log("Error", error.message);
  }
  console.log(error.config);
}
