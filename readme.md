MCP Servers in this project

1) weather-mcp-server
  - Type: stdio
  - Command: node
  - Args: backend/dist/mcpServer.js
  - Purpose: Provides a simple weather backend used by the project (dummy weather generator).

2) filesystem
  - Type: stdio
  - Command: node
  - Args: /home/mohitpuri.goswami@simform.dom/Desktop/khel khel mein/mcp/backend/dist/mcpFileSystem.js --allow "/home/mohitpuri.goswami@simform.dom/Desktop/khel khel mein/mcp"
  - Purpose: Filesystem MCP exposing operations: read_file, create_file, update_file, delete_file, create_directory, list_directory, delete_directory, move_path, rename_path, search_files.
  - Notes: This server requires at least one allowed root (use `--allow` or `FS_ALLOWED_ROOTS` environment variable).

3) io.github.github/github-mcp-server
  - Type: stdio
  - Command: npx
  - Args: -y @modelcontextprotocol/server-github
  - Purpose: GitHub integration MCP server. Requires a GitHub token provided via input `token` (GITHUB_PERSONAL_ACCESS_TOKEN).
  - Config: gallery=https://api.mcp.github.com, version=0.33.0

4) expense-mcp-server
  - Type: stdio
  - Command: node
  - Args: backend/dist/mcpExpense.js
  - Purpose: Expense tracking MCP exposing tools: create_expense, create_expense_from_text, get_expense, list_expenses, update_expense, delete_expense.

How to run (examples)

# Run the filesystem server with an allowed root
node backend/dist/mcpFileSystem.js --allow "/absolute/path/to/project"

# Run the expense server
node backend/dist/mcpExpense.js

# Use Copilot CLI / MCP config
The servers are listed in .vscode/mcp.json; configure your Copilot CLI or MCP manager to run the listed commands as stdio servers.

Security note
- The filesystem server enforces allowed roots and will refuse to start without at least one configured allowed directory. Do not pass untrusted roots.
