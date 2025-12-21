import type { Adapter, BroadcastOptions, Packet } from "./types";

/**
 * In-memory adapter for managing rooms and broadcasting
 * Can be extended with Redis adapter for multi-server setups
 */
export class MemoryAdapter implements Adapter {
  private _rooms: Map<string, Set<string>> = new Map();
  private _socketRooms: Map<string, Set<string>> = new Map();

  /**
   * Add socket to a room
   */
  async addSocket(socketId: string, room: string): Promise<void> {
    // Add to room -> sockets mapping
    if (!this._rooms.has(room)) {
      this._rooms.set(room, new Set());
    }
    this._rooms.get(room)!.add(socketId);

    // Add to socket -> rooms mapping
    if (!this._socketRooms.has(socketId)) {
      this._socketRooms.set(socketId, new Set());
    }
    this._socketRooms.get(socketId)!.add(room);
  }

  /**
   * Remove socket from a room
   */
  async removeSocket(socketId: string, room: string): Promise<void> {
    // Remove from room -> sockets mapping
    const roomSockets = this._rooms.get(room);
    if (roomSockets) {
      roomSockets.delete(socketId);
      if (roomSockets.size === 0) {
        this._rooms.delete(room);
      }
    }

    // Remove from socket -> rooms mapping
    const socketRooms = this._socketRooms.get(socketId);
    if (socketRooms) {
      socketRooms.delete(room);
      if (socketRooms.size === 0) {
        this._socketRooms.delete(socketId);
      }
    }
  }

  /**
   * Remove socket from all rooms
   */
  async removeSocketFromAllRooms(socketId: string): Promise<void> {
    const rooms = this._socketRooms.get(socketId);
    if (!rooms) {
      return;
    }

    // Remove from each room
    const promises = Array.from(rooms).map((room) =>
      this.removeSocket(socketId, room)
    );
    await Promise.all(promises);
  }

  /**
   * Get all sockets in a room
   */
  async getSockets(room: string): Promise<Set<string>> {
    return new Set(this._rooms.get(room) || []);
  }

  /**
   * Get all rooms for a socket
   */
  async getRooms(socketId: string): Promise<Set<string>> {
    return new Set(this._socketRooms.get(socketId) || []);
  }

  /**
   * Broadcast message to rooms
   * This is a placeholder - actual broadcasting happens in ServerImpl
   */
  async broadcast(packet: Packet, opts: BroadcastOptions): Promise<void> {
    // This method is called by multi-server adapters (like Redis)
    // For memory adapter, broadcasting is handled directly by the server
    // This is here for adapter interface compatibility
  }

  /**
   * Close adapter and clean up resources
   */
  async close(): Promise<void> {
    this._rooms.clear();
    this._socketRooms.clear();
  }

  /**
   * Get adapter statistics
   */
  getStats(): {
    totalRooms: number;
    totalSockets: number;
    averageSocketsPerRoom: number;
  } {
    const totalRooms = this._rooms.size;
    const totalSockets = this._socketRooms.size;
    let totalSocketConnections = 0;

    this._rooms.forEach((sockets) => {
      totalSocketConnections += sockets.size;
    });

    return {
      totalRooms,
      totalSockets,
      averageSocketsPerRoom:
        totalRooms > 0 ? totalSocketConnections / totalRooms : 0,
    };
  }
}

/**
 * Redis adapter for scaling across multiple servers
 * Requires redis client to be provided
 */
export class RedisAdapter implements Adapter {
  private _redis: any;
  private _pubClient: any;
  private _subClient: any;
  private _prefix: string;
  private _localAdapter: MemoryAdapter;

  constructor(
    pubClient: any,
    subClient: any,
    options: { prefix?: string } = {}
  ) {
    this._pubClient = pubClient;
    this._subClient = subClient;
    this._prefix = options.prefix || "arcanajs:";
    this._localAdapter = new MemoryAdapter();

    // Subscribe to broadcast channel
    this._setupSubscriptions();
  }

  private async _setupSubscriptions(): Promise<void> {
    // Subscribe to broadcast channel
    await this._subClient.subscribe(
      `${this._prefix}broadcast`,
      (message: string) => {
        try {
          const { packet, opts } = JSON.parse(message);
          // This would trigger local broadcast
          // Implementation depends on how you want to integrate with ServerImpl
        } catch (error) {
          console.error("Failed to process Redis message:", error);
        }
      }
    );
  }

  async addSocket(socketId: string, room: string): Promise<void> {
    await this._localAdapter.addSocket(socketId, room);
    // Optionally store in Redis for cross-server awareness
    await this._pubClient.sadd(`${this._prefix}room:${room}`, socketId);
    await this._pubClient.sadd(`${this._prefix}socket:${socketId}`, room);
  }

  async removeSocket(socketId: string, room: string): Promise<void> {
    await this._localAdapter.removeSocket(socketId, room);
    await this._pubClient.srem(`${this._prefix}room:${room}`, socketId);
    await this._pubClient.srem(`${this._prefix}socket:${socketId}`, room);
  }

  async removeSocketFromAllRooms(socketId: string): Promise<void> {
    const rooms = await this.getRooms(socketId);
    const promises = Array.from(rooms).map((room) =>
      this.removeSocket(socketId, room)
    );
    await Promise.all(promises);
  }

  async getSockets(room: string): Promise<Set<string>> {
    // Get from local adapter
    const localSockets = await this._localAdapter.getSockets(room);

    // For cross-server, you'd query Redis
    // const redisSockets = await this._pubClient.smembers(`${this._prefix}room:${room}`);

    return localSockets;
  }

  async getRooms(socketId: string): Promise<Set<string>> {
    return this._localAdapter.getRooms(socketId);
  }

  async broadcast(packet: Packet, opts: BroadcastOptions): Promise<void> {
    // Publish to Redis for cross-server broadcasting
    await this._pubClient.publish(
      `${this._prefix}broadcast`,
      JSON.stringify({ packet, opts })
    );
  }

  async close(): Promise<void> {
    await this._localAdapter.close();
    await this._subClient.unsubscribe();
    // Don't close clients - they might be shared
  }
}
