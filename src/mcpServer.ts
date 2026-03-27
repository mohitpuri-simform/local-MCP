import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { generateDummyWeather } from "./weather";

const server = new McpServer({
  name: "weather-mcp-server",
  version: "1.0.0",
});

(server.tool as any)(
  "get_weather",
  "Return dummy weather data generated from city location.",
  {
    city: z.string().min(1),
  },
  async ({ city }: { city: string }) => {
    const weather = generateDummyWeather(city);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(weather, null, 2),
        },
      ],
    };
  },
);

async function startServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

startServer().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
