import type { ServerWebSocket } from "bun";
import type { Application } from "../core/application";
import type { WebSocketData } from "../modules/websocket/types";

export async function serve(app: Application, options: { port?: number } = {}) {
  const port = options.port || 3000;

  await app.runStartHooks();

  const server = Bun.serve<WebSocketData>({
    port,
    fetch(req, server) {
      // Store server reference in app for IP detection
      app.server = server;

      // Bind WebSocket server if it exists
      const wsModule = (app as any)._wsInstance;
      if (wsModule && wsModule.bind) {
        wsModule.bind(server);
      }

      // Check if this is a WebSocket upgrade request
      const url = new URL(req.url);
      const wsPath = app.get("websocket.path") || "/socket.io";

      if (url.pathname === wsPath) {
        // Try to upgrade to WebSocket
        const success = server.upgrade(req, {
          data: {
            id: crypto.randomUUID(),
            handshake: {
              time: new Date().toISOString(),
              url: req.url,
              headers: Object.fromEntries(req.headers.entries()),
              query: Object.fromEntries(url.searchParams.entries()),
            },
            rooms: new Set(),
          },
        });
        if (success) {
          return undefined; // WebSocket upgrade successful
        }
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      // Handle regular HTTP requests
      return app.fetch(req);
    },
    websocket: {
      open(ws: ServerWebSocket<WebSocketData>) {
        // Get the WebSocket instance from the app
        const wsModule = (app as any)._wsInstance;
        if (wsModule) {
          // We need to construct a dummy request or pass simpler data since we already have data in ws.data
          // However, createSocket expects a Request to parse URL params again?
          // Actually ServerImpl.createSocket parses req.url.
          // But we don't have the original Request object here easily unless we attached it to data?
          // But we already attached data in upgrade!
          // Let's modify ServerImpl.createSocket to accept data directly or be more flexible.
          // FOR NOW: We reconstruct a request object from the handshake data to satisfy the existing createSocket signature
          // without changing ServerImpl signature if defined strict.
          // But I updated ServerImpl to parse req.

          // Build a Request URL from the handshake.url. Use the server as base
          // so this works whether handshake.url is absolute or path-only.
          const parsed = new URL(
            ws.data.handshake.url,
            `http://localhost:${server.port}`
          );
          const req = new Request(parsed.toString(), {
            headers: ws.data.handshake.headers,
          });

          // We don't link the socket to the ws object anymore to avoid circular references and type issues
          // but ServerImpl.createSocket adds it to the internal map
          wsModule.createSocket(ws, req);
        }
      },
      message(
        ws: ServerWebSocket<WebSocketData>,
        message: string | ArrayBuffer | Uint8Array
      ) {
        const wsModule = (app as any)._wsInstance;
        if (wsModule) {
          const socket = wsModule.sockets.get(ws.data.id);
          if (socket) {
            wsModule.handleMessage(socket, message);
          }
        }
      },
      close(ws: ServerWebSocket<WebSocketData>, code: number, message: string) {
        const wsModule = (app as any)._wsInstance;
        if (wsModule) {
          const socket = wsModule.sockets.get(ws.data.id);
          if (socket) {
            // The socket wrapper might handle disconnect logic
            // But strictly speaking we just need to remove it from server
            wsModule.removeSocket(socket.id);
          }
        }
      },
      drain(ws: ServerWebSocket<WebSocketData>) {
        // Optional: Handle backpressure
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
