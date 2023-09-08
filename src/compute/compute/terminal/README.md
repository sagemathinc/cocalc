# Remote Compute: The Terminal

The idea here is that in a project a user can select that a terminal runs on some powerful remote compute resources. 

The external compute only connects _to_ [cocalc.com](http://cocalc.com) via a websocket \-\- no ssh in or out is involved, and no connection _to_ the external compute.

The terminal then runs on the external compute, making it easy to configure and run powerful code there.
