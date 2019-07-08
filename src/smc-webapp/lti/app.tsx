import * as React from "react";
import * as ReactDOM from "react-dom";
import axios from "axios";

const api_key = "sk_DHSUXftaWOl3t0d4HQEq4ZKv";
const api_url =
  "https://cocalc.com/92234d52-8a1c-4e63-bde3-f2727f5ab8b1/port/39187/api/v1/";
const page = <div> This is from react! </div>;

console.log(
  axios
    .put(api_url + "query", {
      headers: {
        authorization: `Basic ${api_key}`
      },
      json: true,
      data: {
        query: {
          projects_all: [{ project_id: null, title: null, description: null }]
        }
      }
    })
    .then(function(response) {
      console.log(response.data);
      console.log(response.status);
      console.log(response.statusText);
      console.log(response.headers);
      console.log(response.config);
    })
    .catch(function(error) {
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
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
    })
);

export function render_app() {
  ReactDOM.render(page, document.getElementById("cocalc-react-container"));
}
