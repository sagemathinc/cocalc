import axios from "axios";

const config = {
  api_key: "sk_55xJTNDSAez7DNWFI3wV9lZO",
  api_url: "https://cocalc.com/api/v1/"
};

export async function fetch_projects() {
  try {
    const response = await axios({
      method: "post",
      url: config.api_url + "query",
      auth: { username: config.api_key, password: "" },
      data: {
        query: {
          projects_all: [{ project_id: null, title: null, description: null }]
        }
      }
    });
    console.log("api returned:", response.data);

    return response.data.query.projects_all;
  } catch (error) {
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
}
