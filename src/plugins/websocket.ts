import type { Application } from "../core/application";
import { createIOServer } from "../modules/websocket";
import type { ArcanaJSIOServer } from "../modules/websocket/types";
import type { Plugin } from "../types";

export interface WebSocketOptions {
  path?: string;
  cors?: {
    origin: string | string[];
    methods?: string[];
    credentials?: boolean;
  };
  maxPayload?: number;
  idleTimeout?: number;
  compression?: boolean;
  perMessageDeflate?: boolean;
  backpressureLimit?: number;
}

// Extend Application interface to include io property
declare module "../core/application" {
  interface Application {
    io: () => ArcanaJSIOServer;
    websocket: () => ArcanaJSIOServer;
    _wsInstance?: ArcanaJSIOServer;
  }
}

export function websocketPlugin(options: WebSocketOptions = {}): Plugin {
  let io: ArcanaJSIOServer | undefined;

  return {
    name: "websocket",
    install(app: Application) {
      // Set WebSocket path in app settings
      if (options.path) {
        app.set("websocket.path", options.path);
      }

      // Create WebSocket server instance
      io = createIOServer(options);

      // Add websocket method to application
      app.extend("application", "io", () => io!);
      app.extend("application", "websocket", () => io!);

      // Allow direct property access if added dynamically
      if (!(app as any).io) (app as any).io = () => io!;
      if (!(app as any).websocket) (app as any).websocket = () => io!;

      // Handle cleanup on app stop
      app.onStop(() => {
        if (io) {
          io.close();
          io = undefined;
        }
      });

      // Store io instance for server access
      (app as any)._wsInstance = io;
    },
  };
}

export function getWebSocketInstance(app: Application): ArcanaJSIOServer {
  return (app as any)._wsInstance!;
}
