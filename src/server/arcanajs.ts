import type { Application } from "../core/application";

export async function serve(app: Application, options: { port?: number } = {}) {
  const port = options.port || 3000;

  await app.runStartHooks();

  const server = Bun.serve({
    port,
    fetch(req, server) {
      // Store server reference in app for IP detection
      app.server = server;
      // Check if this is a WebSocket upgrade request
      const url = new URL(req.url);
      const wsPath = app.get("websocket.path") || "/socket.io";

      if (url.pathname === wsPath) {
        // Try to upgrade to WebSocket
        const success = server.upgrade(req);
        if (success) {
          return; // WebSocket upgrade successful
        }
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      // Handle regular HTTP requests
      return app.fetch(req);
    },
    websocket: {
      open(ws) {
        // Get the WebSocket instance from the app
        const wsModule = (app as any)._wsInstance;
        if (wsModule) {
          // Create a proper request object with the WebSocket upgrade info
          const url = `http://localhost:${server.port}/socket.io`;
          const socket = (wsModule as any).createSocket(ws, new Request(url));
          (ws as any).socket = socket;
        }
      },
      message(ws, message) {
        const socket = (ws as any).socket;
        if (socket) {
          const wsModule = (app as any)._wsInstance;
          if (wsModule) {
            (wsModule as any).handleMessage(socket, message);
          }
        }
      },
      close(ws, code, message) {
        const socket = (ws as any).socket;
        if (socket) {
          socket._handleEvent("disconnect", { code, message });
          const wsModule = (app as any)._wsInstance;
          if (wsModule) {
            (wsModule as any).removeSocket(socket.id);
          }
        }
      },
      drain(ws) {
        const socket = (ws as any).socket;
        if (socket) {
          socket._handleEvent("drain");
        }
      },
      // Default WebSocket configuration
      maxPayloadLength: 16 * 1024 * 1024, // 16MB
      idleTimeout: 120, // 120 seconds
      perMessageDeflate: true,
    },
    error(error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  // Handle graceful shutdown
  const shutdown = async () => {
    await app.runStopHooks();
    server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}

export function patchListen(app: any) {
  app.listen = async function (this: any, port: number, callback?: () => void) {
    const server = await serve(this, { port });
    if (callback) callback();
    return server;
  };
}
