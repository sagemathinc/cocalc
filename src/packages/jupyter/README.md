# @cocalc/jupyter

Jupyter code in CoCalc. This is used by the frontend, the project and compute.

There is still a lot of Jupyter related code that hasn't been organized yet into this package. It's a refactor-in-progress situation.

- **[blobs](./blobs)**: the backend blobstore, where large objects are stored, instead of storing them in the client or sync file.

- **[kernel](./kernel)**: enumerating and spawning kernels

- **[types](./types)**: typescript declarations.
