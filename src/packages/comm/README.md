Support code for communication, mainly between the project and the frontend app.

Motivation: we need to break the circular dependency between the project and the
frontend, so we need a new place to put such code, which can't depend on either
package, but may depend on several other packages.