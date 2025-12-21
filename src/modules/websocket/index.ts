import type { WebSocketOptions, ArcanaJSIOServer } from "./types";
import { ServerImpl } from "./server";

export function createIOServer(options: WebSocketOptions = {}): ArcanaJSIOServer {
  const server = {
    publish: (topic: string, data: any, compress?: boolean) => 0
  };
  return new ServerImpl(server, options);
}

// Re-export types
export * from "./types";
export * from "./socket";
export * from "./server";
