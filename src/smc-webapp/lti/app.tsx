import * as React from "react";
import * as ReactDOM from "react-dom";
import axios from "axios";

const live_api_key = "sk_55xJTNDSAez7DNWFI3wV9lZO";
const live_api_url = "https://cocalc.com/api/v1/";
// const test_api_key = "sk_DHSUXftaWOl3t0d4HQEq4ZKv";
// const test_api_url = "https://cocalc.com/92234d52-8a1c-4e63-bde3-f2727f5ab8b1/api/v1/";
const page = <div> This is from react! </div>;

axios({
  method: "post",
  url: live_api_url + "query",
  auth: { username: live_api_key, password: "" },
  data: {
    query: {
      projects_all: [{ project_id: null, title: null, description: null }]
    }
  }
})
  .then(function(response) {
    console.log("Success");
    console.log("data", response.data);
    console.log("status", response.status);
    console.log("status text", response.statusText);
    console.log("headers", response.headers);
    console.log("config", response.config);
  })
  .catch(function(error) {
    console.log("Some kind of error");
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
  });

export function render_app() {
  ReactDOM.render(page, document.getElementById("cocalc-react-container"));
}
