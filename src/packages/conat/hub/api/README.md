This API gets called from various places:

- a browser frontend (mostly):
    see packages/frontend/conat/client.ts
    
- a project
    see packages/project/conat/hub.ts
    
- the nextjs servers to make api/python work

This API is *implemented* in two places:

- the main hub itself in packages/server/conat/api

- in lite a minimal version is implemented in packages/lite/hub/api.ts