## 2024-05-22 - SQL Injection in ORDER BY
**Vulnerability:** SQL injection vulnerability in `PostgreSQL` class (CoffeeScript) via `order_by` parameter. The previous check only looked for `'` (apostrophe), allowing other injection vectors.
**Learning:** Legacy CoffeeScript files (`postgres-base.coffee`) may use string interpolation for SQL construction, which is dangerous. Parameterized queries do not support identifiers like `ORDER BY` columns, so they are often interpolated.
**Prevention:** Use strict regex allowlists (e.g., `/^[a-zA-Z0-9_.,\s]+$/`) for validating SQL identifiers or clauses that cannot be parameterized. Avoid blacklists.
