import type {
  ArcanaJSIOServer,
  BroadcastOperator,
  BroadcastOptions,
  Packet,
} from "./types";

/**
 * Broadcast operator implementation for chaining room targeting
 * Provides fluent API for targeting specific sockets/rooms
 */
export class BroadcastOperatorImpl implements BroadcastOperator {
  private _server: ArcanaJSIOServer;
  private _opts: BroadcastOptions;

  constructor(server: ArcanaJSIOServer, options: BroadcastOptions = {}) {
    this._server = server;
    this._opts = {
      rooms: options.rooms || [],
      except: options.except || [],
      compress: options.compress ?? false,
      local: options.local ?? false,
      volatile: options.volatile ?? false,
    };
  }

  /**
   * Target specific room(s)
   */
  to(room: string | string[]): BroadcastOperator {
    const rooms = Array.isArray(room) ? room : [room];
    return new BroadcastOperatorImpl(this._server, {
      ...this._opts,
      rooms: [...(this._opts.rooms || []), ...rooms],
    });
  }

  /**
   * Alias for to()
   */
  in(room: string | string[]): BroadcastOperator {
    return this.to(room);
  }

  /**
   * Exclude specific socket(s)
   */
  except(socketIds: string | string[]): BroadcastOperator {
    const ids = Array.isArray(socketIds) ? socketIds : [socketIds];
    return new BroadcastOperatorImpl(this._server, {
      ...this._opts,
      except: [...(this._opts.except || []), ...ids],
    });
  }

  /**
   * Enable/disable compression
   */
  compress(compress: boolean): BroadcastOperator {
    return new BroadcastOperatorImpl(this._server, {
      ...this._opts,
      compress,
    });
  }

  /**
   * Mark messages as volatile (skip if client disconnected)
   */
  get volatile(): BroadcastOperator {
    return new BroadcastOperatorImpl(this._server, {
      ...this._opts,
      volatile: true,
    });
  }

  /**
   * Mark messages as local only (don't broadcast via adapter)
   */
  get local(): BroadcastOperator {
    return new BroadcastOperatorImpl(this._server, {
      ...this._opts,
      local: true,
    });
  }

  /**
   * Emit event to all matching sockets
   */
  emit<T = any>(event: string, data?: T): void {
    const packet: Packet = {
      type: event,
      data,
      id: Date.now().toString(),
      nsp: this._server.name,
    };

    const message = JSON.stringify(packet);
    const except = new Set(this._opts.except || []);

    // If rooms are specified, publish to those rooms
    if (this._opts.rooms && this._opts.rooms.length > 0) {
      this._opts.rooms.forEach((room) => {
        // Publish to room (Bun's publish excludes sender by default)
        this._server.publish(room, message, this._opts.compress);
      });
    } else {
      // Broadcast to all connected sockets (except excluded ones)
      this._server.sockets.forEach((socket) => {
        // Skip excluded sockets
        if (except.has(socket.id)) {
          return;
        }

        // Skip disconnected sockets if volatile
        if (this._opts.volatile && socket.disconnected) {
          return;
        }

        // Send message
        try {
          socket.send(message, this._opts.compress);
        } catch (error) {
          console.error(`Failed to broadcast to socket ${socket.id}:`, error);
        }
      });
    }
  }

  /**
   * Get all socket IDs matching the broadcast criteria
   */
  async allSockets(): Promise<Set<string>> {
    const socketIds = new Set<string>();
    const except = new Set(this._opts.except || []);

    // If rooms are specified, get sockets in those rooms
    if (this._opts.rooms && this._opts.rooms.length > 0) {
      this._server.sockets.forEach((socket) => {
        // Check if socket is in any of the target rooms
        const inTargetRoom = this._opts.rooms!.some((room) =>
          socket.rooms.has(room)
        );

        if (inTargetRoom && !except.has(socket.id)) {
          socketIds.add(socket.id);
        }
      });
    } else {
      // Get all sockets except excluded ones
      this._server.sockets.forEach((socket) => {
        if (!except.has(socket.id)) {
          socketIds.add(socket.id);
        }
      });
    }

    return socketIds;
  }

  /**
   * Disconnect all sockets matching the broadcast criteria
   */
  disconnectSockets(close = true): void {
    const except = new Set(this._opts.except || []);

    // If rooms are specified, disconnect sockets in those rooms
    if (this._opts.rooms && this._opts.rooms.length > 0) {
      this._server.sockets.forEach((socket) => {
        const inTargetRoom = this._opts.rooms!.some((room) =>
          socket.rooms.has(room)
        );

        if (inTargetRoom && !except.has(socket.id)) {
          socket.disconnect(close);
        }
      });
    } else {
      // Disconnect all sockets except excluded ones
      this._server.sockets.forEach((socket) => {
        if (!except.has(socket.id)) {
          socket.disconnect(close);
        }
      });
    }
  }
}
