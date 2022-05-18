The contents of this directory is just a rewrite of https://github.com/K3D-tools/K3D-jupyter/blob/main/js/src/k3d.js using Typescript and more modularity, and also using ES6 classes which is more "future proof" regarding Backbone.js and newer versions of Ipywidgets.

The license is all code in this directory is the same as for upstream, namely the MIT license as given here:

https://github.com/K3D-tools/K3D-jupyter/blob/main/LICENSE.txt

If any k3d devs ever want to rewrite k3d.js using Typescript/modularity/ES6 classes, etc., they are of course 100% welcome to use the code in this directory in absolutely any way they want.

The design of k3d itself is excellent, in that it makes a very clear modular separation of the core k3d application from the integration with ipywidgets.  The core k3d library exports exactly the right functionality to support everything we wanted to do here, and we greatly appreciate that!