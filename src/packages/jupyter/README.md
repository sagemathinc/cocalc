# @cocalc/jupyter

## What this is

Jupyter code in CoCalc. This is used by the frontend, the project and compute.

There is still a lot of Jupyter related code that hasn't been organized yet into this package. It's a refactor-in-progress situation.

## Directories

- [**blobs**](./blobs): the backend blobstore, where large objects are stored, instead of storing them in the client or sync file.

- [**execute**](./execute): handles execution of code

- [**ipynb**](./ipynb): handles importing and exporting to the ipynb format.  CoCalc uses its own internal jsonlines format.

- [**kernel**](./kernel): enumerating and spawning kernels

- [**nbgrader**](./nbgrader): our implementation of nbgrader, especially the backend support

- [**pool**](./pool): manages a pool of prestarted kernels so people often don't have to wait for a kernel to start

- [**redux**](./redux): Redux Actions and Store for jupyter, so we can work with the jupyter notebook doc 

- [**types**](./types): typescript declarations.

- [**util**](./util): little jupyter related things

