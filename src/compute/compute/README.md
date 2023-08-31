# @cocalc/compute

## Goal

The minimal goal of this package is to connect from a nodejs process to a cocalc project, open a Jupyter notebook sync session, and provide the output. I.e., instead of the project itself running a kernel and providing output, the kernel will be provided by whatever client is running this `@cocalc/compute` package!

Concern: I want this package to remain lightweight if at all possible, so it's fast to install and uses little space. Also, we eventually plan to run a variant of it in a web browser, which is another reason to keep it small. On the other hand, to offer a really useful Jupyter kernel environment, this will probably be part of a big Docker container or something...

## Build

**Do NOT do** `pnpm install .` directly here. That will mess things up! Instead do `pnpm make.`

Note that this is not built as part of the rest of cocalc and this directory is not one of the
workspace packages. This is intentional, since the websocketfs dependency dependson libfuse support
on the host machine, which can be a pain to build, and we don't need @cocalc/compute for running
most of cocalc. In any case, after building cocalc, you can install deps and build this via
this in the current directory:

```sh
pnpm make
```

I might have to move @cocalc/compute to a separate git repo to avoid confusion.  We'll see...

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

## Try It Out

Define the following three environment variables:

```sh
export API_KEY="sk-xxxxxxxxxxxxxxxxxxxx"
export PROJECT_ID="10f0e544-313c-4efe-8718-2142ac97ad11"
export IPYNB_PATH="Untitled.ipynb"
```

- `API_KEY` -- You make this in project settings. It is specific to the project you want to connect to on https://cocalc.com:
- `PROJECT_ID` -- The project id is in the URL or project settings
- `IPYNB_PATH` -- The IPYNB_PATH is the path of a Jupyter notebook. You should have that notebook open in your browser.

After setting the above variables, you can FUSE WebSocketFS mount the
home directory of the project and switch to using your compute for
that kernel as follows:

```sh
cd /cocalc/src/packages/compute
node ./bin/kernel.js
```

### Tweaks

Do this if you want to see VERY verbose logs:

```sh
export DEBUG=*
export DEBUG_CONSOLE=yes
```

If you're using a different server, these could be relevant:

```sh
export BASE_PATH="/"
export API_SERVER="https://cocalc.com"
export API_BASE_PATH="/"
```

### Mounting just the project home directory

Mount the project's HOME directory at /tmp/project by
running this code in nodejs after setting all of the above environment variables.

```js
await require("@cocalc/compute").mountProject({
  project_id: process.env.PROJECT_ID,
  path: "/tmp/project",
});
0;
```

### Jupyter

You should open the notebook Untitled.ipynb on [cocalc.com](http://cocalc.com).
Then set all the above env variables in another terminal and run the following code in node.js. **Running of that Jupyter notebook will then switch to your local machine.**

```js
await require("@cocalc/compute").jupyter({
  project_id: process.env.PROJECT_ID,
  path: "Untitled.ipynb",
  cwd: "/tmp/project",
});
0;
```

