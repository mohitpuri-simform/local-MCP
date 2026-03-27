import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// read_file: Read file content as UTF‑8 text (filePath).
// create_file: Create a new file; fails if it already exists (filePath, content).
// update_file: Overwrite an existing file (filePath, content).
// delete_file: Delete a file (filePath).
// create_directory: Create directory recursively (dirPath).
// list_directory: List direct directory entries (dirPath).
// delete_directory: Delete directory (use recursive=true to remove non‑empty) (dirPath, recursive).
// move_path: Move file/dir; fails if destination exists (sourcePath, destinationPath).
// rename_path: Rename file/dir within same parent; fails if destination exists (targetPath, newName).
// search_files: Recursive search with wildcard pattern (e.g., *.js) (baseDir?, pattern, maxResults).

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

const server = new McpServer({
  name: "filesystem-mcp-server",
  version: "1.0.0",
});

function parseAllowedRoots(argv: string[]): string[] {
  const cliRoots: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--allow" && argv[i + 1]) {
      cliRoots.push(argv[i + 1]);
      i++;
      continue;
    }
    if (arg.startsWith("--allow=")) {
      cliRoots.push(arg.slice("--allow=".length));
    }
  }

  const envRoots = (process.env.FS_ALLOWED_ROOTS ?? "")
    .split(/[;,]/g)
    .map((x) => x.trim())
    .filter(Boolean);

  const all = [...cliRoots, ...envRoots].map((p) => path.resolve(p));
  return [...new Set(all)];
}

const allowedRoots = parseAllowedRoots(process.argv.slice(2));
if (allowedRoots.length === 0) {
  throw new Error(
    "No allowed roots configured. Use --allow <dir> or FS_ALLOWED_ROOTS.",
  );
}

function isInsideRoot(target: string, root: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function resolveSafePath(inputPath: string): Promise<string> {
  if (!inputPath?.trim()) throw new Error("Path is required.");

  // Relative paths are anchored to first allowed root.
  const base = path.isAbsolute(inputPath) ? "" : allowedRoots[0];
  const abs = path.resolve(base, path.normalize(inputPath));

  // Resolve symlink-safe path.
  let candidate: string;
  try {
    const stat = await fs.lstat(abs);
    if (stat.isSymbolicLink()) {
      const real = await fs.realpath(abs);
      candidate = real;
    } else {
      candidate = abs;
    }
  } catch {
    // Non-existing target: resolve parent to avoid traversal through symlinked parent.
    const parent = path.dirname(abs);
    let parentReal = parent;
    try {
      parentReal = await fs.realpath(parent);
    } catch {
      // keep parent as-is if not yet existing
    }
    candidate = path.join(parentReal, path.basename(abs));
  }

  const ok = allowedRoots.some((root) => isInsideRoot(candidate, root));
  if (!ok) throw new Error("Access denied: outside allowed directories.");

  return candidate;
}

function wildcardToRegExp(pattern: string): RegExp {
  // simple wildcard: * and ?
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = "^" + escaped.replace(/\*/g, ".*").replace(/\?/g, ".") + "$";
  return new RegExp(regex);
}

function ok(payload: Record<string, JsonValue>) {
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: true, ...payload }) }],
  };
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    content: [
      { type: "text", text: JSON.stringify({ ok: false, error: message }) },
    ],
  };
}

async function safeRun(fn: () => Promise<any>) {
  try {
    return await fn();
  } catch (error) {
    return fail(error);
  }
}

// 1) Read file
(server.tool as any)(
  "read_file",
  "Read file content as UTF-8 text.",
  {
    filePath: z.string().min(1),
  },
  async ({ filePath }: { filePath: string }) =>
    safeRun(async () => {
      const abs = await resolveSafePath(filePath);
      const data = await fs.readFile(abs, "utf8");
      return ok({ filePath: abs, content: data });
    }),
);

// 2) Create file (fails if exists)
(server.tool as any)(
  "create_file",
  "Create a new file. Fails if file already exists.",
  {
    filePath: z.string().min(1),
    content: z.string().default(""),
  },
  async ({ filePath, content }: { filePath: string; content: string }) =>
    safeRun(async () => {
      const abs = await resolveSafePath(filePath);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, { encoding: "utf8", flag: "wx" });
      return ok({ filePath: abs, created: true });
    }),
);

// 3) Update/overwrite file (fails if missing)
(server.tool as any)(
  "update_file",
  "Update or overwrite an existing file.",
  {
    filePath: z.string().min(1),
    content: z.string(),
  },
  async ({ filePath, content }: { filePath: string; content: string }) =>
    safeRun(async () => {
      const abs = await resolveSafePath(filePath);
      await fs.access(abs);
      await fs.writeFile(abs, content, { encoding: "utf8", flag: "w" });
      return ok({ filePath: abs, updated: true });
    }),
);

// 4) Delete file
(server.tool as any)(
  "delete_file",
  "Delete a file.",
  {
    filePath: z.string().min(1),
  },
  async ({ filePath }: { filePath: string }) =>
    safeRun(async () => {
      const abs = await resolveSafePath(filePath);
      const st = await fs.lstat(abs);
      if (!st.isFile()) throw new Error("Target is not a file.");
      await fs.unlink(abs);
      return ok({ filePath: abs, deleted: true });
    }),
);

// 5) Create directory
(server.tool as any)(
  "create_directory",
  "Create a directory recursively.",
  {
    dirPath: z.string().min(1),
  },
  async ({ dirPath }: { dirPath: string }) =>
    safeRun(async () => {
      const abs = await resolveSafePath(dirPath);
      await fs.mkdir(abs, { recursive: true });
      return ok({ dirPath: abs, created: true });
    }),
);

// 6) List directory
(server.tool as any)(
  "list_directory",
  "List direct directory contents.",
  {
    dirPath: z.string().min(1),
  },
  async ({ dirPath }: { dirPath: string }) =>
    safeRun(async () => {
      const abs = await resolveSafePath(dirPath);
      const entries = await fs.readdir(abs, { withFileTypes: true });
      return ok({
        dirPath: abs,
        entries: entries.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "directory" : e.isFile() ? "file" : "other",
        })),
      });
    }),
);

// 7) Delete directory
(server.tool as any)(
  "delete_directory",
  "Delete directory. Use recursive=true to remove non-empty directory.",
  {
    dirPath: z.string().min(1),
    recursive: z.boolean().optional(),
  },
  async ({ dirPath, recursive }: { dirPath: string; recursive?: boolean }) =>
    safeRun(async () => {
      const abs = await resolveSafePath(dirPath);
      await fs.rm(abs, { recursive: !!recursive, force: false });
      return ok({ dirPath: abs, deleted: true, recursive: !!recursive });
    }),
);

// 8) Move path
(server.tool as any)(
  "move_path",
  "Move file or directory. Fails if destination exists.",
  {
    sourcePath: z.string().min(1),
    destinationPath: z.string().min(1),
  },
  async ({
    sourcePath,
    destinationPath,
  }: {
    sourcePath: string;
    destinationPath: string;
  }) =>
    safeRun(async () => {
      const src = await resolveSafePath(sourcePath);
      const dst = await resolveSafePath(destinationPath);

      try {
        await fs.access(dst);
        throw new Error("Destination already exists.");
      } catch (e) {
        if (
          !(e instanceof Error) ||
          !/Destination already exists/.test(e.message)
        ) {
          // destination does not exist -> continue
        } else {
          throw e;
        }
      }

      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.rename(src, dst);
      return ok({ sourcePath: src, destinationPath: dst, moved: true });
    }),
);

// 9) Rename path (same parent by default)
(server.tool as any)(
  "rename_path",
  "Rename file or directory in the same parent directory.",
  {
    targetPath: z.string().min(1),
    newName: z.string().min(1),
  },
  async ({ targetPath, newName }: { targetPath: string; newName: string }) =>
    safeRun(async () => {
      if (newName.includes("/") || newName.includes("\\")) {
        throw new Error("newName must be a base name, not a path.");
      }

      const src = await resolveSafePath(targetPath);
      const dst = await resolveSafePath(path.join(path.dirname(src), newName));

      try {
        await fs.access(dst);
        throw new Error("Destination already exists.");
      } catch (e) {
        if (
          !(e instanceof Error) ||
          !/Destination already exists/.test(e.message)
        ) {
          // destination does not exist -> continue
        } else {
          throw e;
        }
      }

      await fs.rename(src, dst);
      return ok({ oldPath: src, newPath: dst, renamed: true });
    }),
);

// 10) Recursive search
(server.tool as any)(
  "search_files",
  "Recursive search with wildcard pattern, e.g. *.js",
  {
    baseDir: z.string().optional(),
    pattern: z.string().default("*"),
    maxResults: z.number().int().positive().max(10000).optional(),
  },
  async ({
    baseDir,
    pattern,
    maxResults,
  }: {
    baseDir?: string;
    pattern: string;
    maxResults?: number;
  }) =>
    safeRun(async () => {
      const limit = maxResults ?? 1000;
      const matcher = wildcardToRegExp(pattern);

      const roots = baseDir ? [await resolveSafePath(baseDir)] : allowedRoots;
      const results: string[] = [];

      async function walk(dir: string): Promise<void> {
        if (results.length >= limit) return;
        const items = await fs.readdir(dir, { withFileTypes: true });

        for (const item of items) {
          if (results.length >= limit) return;
          const full = path.join(dir, item.name);

          if (item.isDirectory()) {
            await walk(full);
            continue;
          }

          if (item.isFile() && matcher.test(item.name)) {
            results.push(full);
          }
        }
      }

      for (const root of roots) {
        await walk(root);
        if (results.length >= limit) break;
      }

      return ok({ pattern, count: results.length, matches: results });
    }),
);

async function startServer(): Promise<void> {
  // Ensure allowed roots exist.
  await Promise.all(allowedRoots.map((r) => fs.mkdir(r, { recursive: true })));

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Logging without sensitive details (only count).
  console.log(
    JSON.stringify({
      event: "filesystem_mcp_started",
      allowedRootsCount: allowedRoots.length,
    }),
  );
}

startServer().catch((error) => {
  console.error(
    "Failed to start filesystem MCP server:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
