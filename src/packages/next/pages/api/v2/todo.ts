import { z } from "zod";
import { apiRoute, apiRouteOperation } from "next-rest-framework";

const MOCK_TODOS = [
  {
    id: 1,
    name: "TODO 1",
    completed: false,
  },
  // ...
];

const todoSchema = z.object({
  id: z.number(),
  name: z.string(),
  completed: z.boolean(),
});

export default apiRoute({
  getTodos: apiRouteOperation({
    method: "GET",
  })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: z.array(todoSchema),
      },
    ])
    .handler((_req, res) => {
      res.status(200).json(MOCK_TODOS);
    }),

  createTodo: apiRouteOperation({
    method: "POST",
  })
    .input({
      contentType: "application/json",
      body: z.object({
        name: z.string(),
      }),
    })
    .outputs([
      {
        status: 201,
        contentType: "application/json",
        body: z.string(),
      },
      {
        status: 401,
        contentType: "application/json",
        body: z.string(),
      },
    ])
    // Optional middleware logic executed before request validation.
    .middleware((req, res) => {
      if (!req.headers["very-secure"]) {
        res.status(401).json("Unauthorized");
      }
    })
    .handler((req, res) => {
      const { name } = req.body;
      // Create a new TODO.
      res.status(201).json(`New TODO created: ${name}`);
    }),
});
