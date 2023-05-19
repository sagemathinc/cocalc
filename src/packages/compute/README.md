# @cocalc/compute

The goal of this is to connect to a cocalc project, open a Jupyter notebook sync session, and provide the output.  I.e., instead of the project running a kernel and providing output, it will be provided by whatever client is running this @cocalc/compute!

Examples:

- A powerful computer \(possibly with a GPU?\) and a Jupyter kernel installed
- A web browser providing Python code evaluation via WebAssembly.
  - You point a web browser on some random powerful compute you have at cocalc
  - You \(and collabs\) can then use this power from cocalc on your laptop.
- A web browser with WebGPU [providing PyTorch](https://praeclarum.org/2023/05/19/webgpu-torch.html) \(say\).

The filesystem from the project will get mounted probably via sshfs.  In the case of a server this is straightforward.  It may also be [possible from the browser](https://hackmd.io/@q/sftp-over-ws), using [sftp\-ws](https://github.com/Inveniem/sftp-ws).

This is currently an unfinished work in progress.  We will focus mostly on the powerful computer scenario first, since then sshfs is easy, and it's also what we need to make cocalc vastly more useful to people.
