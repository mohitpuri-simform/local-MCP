# Backend MCP Servers

## 1) Install and build after cloning

```bash
cd backend
npm install
npm run build
```

## 2) Run MCP servers

Weather MCP:

```bash
npm run start:mcp
```

Expense MCP:

```bash
npm run start:expense-mcp
```

Filesystem MCP:

```bash
npm run start:fs-mcp
```

The filesystem server needs at least one allowed root. This repo sets it via `--allow ..` in the npm script, which points to the repository root when run from `backend`.

## 3) Development mode (watch)

```bash
npm run dev:mcp
npm run dev:expense-mcp
npm run dev:fs-mcp
```

## Server summary

1. weather-mcp-server

- Type: stdio
- Entry: dist/mcpServer.js
- Tool: get_weather

2. expense-mcp-server

- Type: stdio
- Entry: dist/mcpExpense.js
- Tools: create_expense, create_expense_from_text, get_expense, list_expenses, update_expense, delete_expense

3. filesystem-mcp-server

- Type: stdio
- Entry: dist/mcpFileSystem.js
- Tools: read_file, create_file, update_file, delete_file, create_directory, list_directory, delete_directory, move_path, rename_path, search_files

4. io.github.github/github-mcp-server

- Type: stdio
- Command: npx -y @modelcontextprotocol/server-github
- Requirement: set GITHUB_PERSONAL_ACCESS_TOKEN

## Important for cloned repos

Check .vscode/mcp.json and replace machine-specific absolute paths with your local clone path.

## Security note

The filesystem server blocks access outside allowed roots. Use narrow trusted paths only.
