## 2026-01-24 - SQL Injection in ORDER BY
**Vulnerability:** SQL injection vulnerability in `postgres-base.coffee` where `order_by` parameter was only validated by checking for single quotes, allowing injection of other SQL constructs.
**Learning:** `ORDER BY` clauses cannot be parameterized in standard prepared statements, leading to dangerous manual string concatenation. Blocklisting specific characters (like `'`) is insufficient.
**Prevention:** Use strict allowlisting (regex validation) for dynamic identifiers and clauses like `ORDER BY` that cannot be parameterized. Ensure inputs are restricted to safe characters (alphanumeric, underscore, comma, space).
