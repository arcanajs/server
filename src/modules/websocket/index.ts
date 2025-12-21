/**
 * ArcanaJS WebSocket Module
 *
 */

import { ServerImpl } from "./server";
import type { ArcanaJSIOServer, WebSocketOptions } from "./types";

/**
 * Create a new WebSocket IO server instance
 *
 * @param options - WebSocket server configuration options
 * @returns ArcanaJSIOServer instance
 *
 * @example
 * ```typescript
 * const io = createIOServer({
 *   path: '/socket.io',
 *   compression: true,
 *   maxPayload: 1024 * 1024,
 *   pingInterval: 25000,
 *   pingTimeout: 20000
 * });
 *
 * io.on('connection', (socket) => {
 *   console.log('Client connected:', socket.id);
 *
 *   socket.on('message', (data) => {
 *     console.log('Received:', data);
 *     socket.emit('response', { received: true });
 *   });
 *
 *   socket.on('disconnect', () => {
 *     console.log('Client disconnected:', socket.id);
 *   });
 * });
 * ```
 */
export function createIOServer(
  options: WebSocketOptions = {}
): ArcanaJSIOServer {
  // Create a minimal server object for publish support
  // This will be replaced by the real Bun server in bind()
  const server = {
    publish: (topic: string, data: any, compress?: boolean) => {
      console.warn(
        "WebSocket server not bound yet. Call bind() or use serve()."
      );
      return 0;
    },
  };

  return new ServerImpl(server, options);
}

// ============================================================================
// EXPORTS
// ============================================================================

// Core classes
export { MemoryAdapter, RedisAdapter } from "./adapter";
export { BroadcastOperatorImpl } from "./broadcast";
export { ServerImpl } from "./server";
export { SocketImpl } from "./socket";

// Type exports
export * from "./types";

// Default export
export default createIOServer;
