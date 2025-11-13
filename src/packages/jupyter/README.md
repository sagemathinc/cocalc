# @cocalc/jupyter

## What this is

Jupyter code in CoCalc. This is used by the frontend, the project and compute.

There is still a lot of Jupyter related code that hasn't been organized yet into this package. It's a refactor-in-progress situation.

## Directories

The `blobs` subdirectory stores large objects, while `execute` manages code execution. `ipynb` is for handling ipynb files, and `kernel` handles kernel enumeration and spawning. `nbgrader` contains CoCalc's grading tool for Jupyter notebooks, and `pool` maintains pre-started kernels to reduce waiting time. `redux` houses actions and stores for Jupyter's notebook doc compatibility. `stateless-api` implements a stateless code-evaluating API, and `util` includes miscellaneous Jupyter-related functionalities.

- [blobs](./blobs): manage the backend blobstore, where large objects are stored; this is backed by NATS.
- [execute](./execute): handles execution of code
- [ipynb](./ipynb): handles importing and exporting to the ipynb format.  CoCalc uses its own internal jsonlines format.
- [kernel](./kernel): enumerating and spawning kernels
- [nbgrader](./nbgrader): our implementation of nbgrader, especially the backend support
- [pool](./pool): manages a pool of prestarted kernels so people often don't have to wait for a kernel to start
- [redux](./redux): Redux Actions and Store for jupyter, so we can work with the jupyter notebook doc 
- [stateless\-api](./stateless-api): implements stateless api for evaluating code, which is used e.g., for the share server and in markdown.
- [types](./types): typescript declarations.
- [util](./util): little jupyter related things

