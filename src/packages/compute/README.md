# @cocalc/compute

## Goal

The minimal goal of this package is to connect from a nodejs process to a cocalc project, open a Jupyter notebook sync session, and provide the output. I.e., instead of the project itself running a kernel and providing output, the kernel will be provided by whatever client is running this `@cocalc/compute` package!

Concern: I want this package to remain lightweight if at all possible, so it's fast to install and uses little space. Also, we eventually plan to run a variant of it in a web browser, which is another reason to keep it small. On the other hand, to offer a really useful Jupyter kernel environment, this will probably be part of a big Docker container or something...

## Examples of where to run this

- A powerful computer \(possibly with a GPU?\) and a Jupyter kernel installed
- A web browser providing Python code evaluation via WebAssembly.
  - You point a web browser on some random powerful compute you have at cocalc
  - You \(and collabs\) can then use this power from cocalc on your laptop.
- A web browser with WebGPU [providing PyTorch](https://praeclarum.org/2023/05/19/webgpu-torch.html) \(say\).

## The filesystem

The filesystem from the project will get mounted via [WebSocketFS](https://github.com/sagemathinc/websocketfs). This will initially only be for FUSE, but later could also use WASI in the browser.

## Status

This is currently an unfinished work in progress. We will focus mostly on the powerful Linux host for @cocalc/compute first, since it's also what we need to make cocalc vastly more useful to people.

We are also focusing initially on a single Jupyter notebook. However, this could also be useful for terminals and many other things.

## Example

Create an API*KEY in \_project settings*, where the api key is specific to the project you want to connect to.

```sh
export BASE_PATH="/"
export API_KEY="sk-xxxxxxxxxxxxxxxxxxxx"
export API_SERVER="https://cocalc.com"
export API_BASE_PATH="/"
export PROJECT_ID="10f0e544-313c-4efe-8718-2142ac97ad11"
export DEBUG=cocalc:*
export DEBUG_CONSOLE=yes

```

### Mounting the project home directory

Mount the project's HOME directory at /tmp/project by
running this code in nodejs after setting all of the above environment variables.

```js
await require("@cocalc/compute").mountProject({
  project_id: process.env.PROJECT_ID,
  path: "/tmp/project",
}); 0;
```

### Jupyter

You should open the notebook Untitled.ipynb on [cocalc.com](http://cocalc.com).
Then set all the above env variables in another terminal and run the following code in node.js.  **Running of that Jupyter notebook will then switch to your local machine.**

```js
await require("@cocalc/compute").jupyter({
  project_id: process.env.PROJECT_ID,
  path: "Untitled.ipynb",
  cwd: "/tmp/project",
}); 0;
```

