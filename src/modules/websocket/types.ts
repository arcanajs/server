import type { ServerWebSocket, WebSocketReadyState } from "bun";

export { ServerWebSocket, WebSocketReadyState };

/**
 * WebSocket connection data stored on each socket
 */
export interface WebSocketData {
  /** Unique socket identifier */
  id: string;
  /** Connection handshake information */
  handshake: {
    time: string;
    url: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    address: string;
    secure: boolean;
  };
  /** Rooms this socket has joined */
  rooms: Set<string>;
  /** Custom authentication data */
  auth?: any;
  /** Custom user data */
  userData?: any;
  /** Connection state flags */
  connected: boolean;
  /** Disconnect reason */
  disconnectReason?: string;
}

/**
 * WebSocket server configuration options
 */
export interface WebSocketOptions {
  /** WebSocket endpoint path */
  path?: string;
  /** CORS configuration */
  cors?: {
    origin: string | string[] | ((origin: string) => boolean);
    methods?: string[];
    credentials?: boolean;
    allowedHeaders?: string[];
    exposedHeaders?: string[];
    maxAge?: number;
  };
  /** Maximum payload size in bytes */
  maxPayload?: number;
  /** Idle timeout in seconds */
  idleTimeout?: number;
  /** Enable compression */
  compression?: boolean;
  /** Enable per-message deflate */
  perMessageDeflate?: boolean;
  /** Backpressure limit in bytes */
  backpressureLimit?: number;
  /** Connection timeout in milliseconds */
  connectTimeout?: number;
  /** Ping interval in milliseconds */
  pingInterval?: number;
  /** Ping timeout in milliseconds */
  pingTimeout?: number;
  /** Allow upgrades from HTTP/2 */
  allowHTTP2?: boolean;
  /** Close on backpressure limit */
  closeOnBackpressureLimit?: boolean;
}

/**
 * Middleware function type for WebSocket connections
 */
export interface WebSocketMiddleware {
  (socket: ArcanaJSSocket, next: (err?: any) => void): void | Promise<void>;
}

/**
 * Event handler with socket parameter
 */
export type EventHandlerWithSocket<T = any> = (
  socket: ArcanaJSSocket,
  data?: T,
  ack?: AckCallback
) => void | Promise<void>;

/**
 * Event handler with data only
 */
export type EventHandlerDataOnly<T = any> = (
  data?: T,
  ack?: AckCallback
) => void | Promise<void>;

/**
 * Generic event handler type
 */
export type EventHandler<T = any> =
  | EventHandlerWithSocket<T>
  | EventHandlerDataOnly<T>;

/**
 * Acknowledgment callback function
 */
export type AckCallback = (error?: Error | null, data?: any) => void;

/**
 * Broadcast operation options
 */
export interface BroadcastOptions {
  /** Target specific rooms */
  rooms?: string[];
  /** Exclude specific socket IDs */
  except?: string[];
  /** Enable compression for this broadcast */
  compress?: boolean;
  /** Send only to local server (no Redis adapter) */
  local?: boolean;
  /** Volatile message (skip if client disconnected) */
  volatile?: boolean;
}

/**
 * Message packet structure
 */
export interface Packet {
  /** Packet type/event name */
  type: string;
  /** Packet data */
  data?: any;
  /** Packet ID for acknowledgments */
  id?: string;
  /** Namespace */
  nsp?: string;
  /** Acknowledgment flag */
  ack?: boolean;
  /** Binary attachments count */
  attachments?: number;
}

/**
 * Acknowledgment packet structure
 */
export interface AckPacket {
  type: "ack";
  id: string;
  data?: any;
  error?: string;
}

/**
 * Room adapter interface for scaling across multiple servers
 */
export interface Adapter {
  /** Add socket to room */
  addSocket(socketId: string, room: string): Promise<void>;
  /** Remove socket from room */
  removeSocket(socketId: string, room: string): Promise<void>;
  /** Remove socket from all rooms */
  removeSocketFromAllRooms(socketId: string): Promise<void>;
  /** Get all sockets in a room */
  getSockets(room: string): Promise<Set<string>>;
  /** Get all rooms for a socket */
  getRooms(socketId: string): Promise<Set<string>>;
  /** Broadcast to rooms */
  broadcast(packet: Packet, opts: BroadcastOptions): Promise<void>;
  /** Close adapter */
  close(): Promise<void>;
}

/**
 * Broadcast operator for chaining room/except operations
 */
export interface BroadcastOperator {
  /** Target specific rooms */
  to(room: string | string[]): BroadcastOperator;
  /** Alias for to() */
  in(room: string | string[]): BroadcastOperator;
  /** Exclude specific sockets */
  except(socketIds: string | string[]): BroadcastOperator;
  /** Enable compression */
  compress(compress: boolean): BroadcastOperator;
  /** Mark as volatile */
  volatile: BroadcastOperator;
  /** Mark as local only */
  local: BroadcastOperator;
  /** Emit event to filtered sockets */
  emit<T = any>(event: string, data?: T): void;
  /** Get socket IDs matching the broadcast criteria */
  allSockets(): Promise<Set<string>>;
  /** Disconnect all sockets matching criteria */
  disconnectSockets(close?: boolean): void;
}

/**
 * Socket wrapper interface
 */
export interface ArcanaJSSocket {
  /** Unique socket identifier */
  readonly id: string;
  /** Socket data */
  data: WebSocketData;
  /** Rooms this socket has joined */
  readonly rooms: Set<string>;
  /** Connection ready state */
  readonly readyState: WebSocketReadyState;
  /** Remote address */
  readonly remoteAddress: string;
  /** Whether socket is connected */
  readonly connected: boolean;
  /** Whether socket is disconnected */
  readonly disconnected: boolean;
  /** Handshake information */
  readonly handshake: WebSocketData["handshake"];
  /** Server reference */
  readonly server: ArcanaJSIOServer;

  // Event methods
  /** Register event handler */
  on<T = any>(event: string, handler: EventHandler<T>): this;
  /** Register one-time event handler */
  once<T = any>(event: string, handler: EventHandler<T>): this;
  /** Remove event handler */
  off(event: string, handler?: EventHandler): this;
  /** Remove all listeners for event */
  removeAllListeners(event?: string): this;
  /** Emit event to this socket */
  emit<T = any>(event: string, data?: T, ack?: AckCallback): this;
  /** Emit event with acknowledgment */
  emitWithAck<T = any>(event: string, data?: T): Promise<any>;

  // Room methods
  /** Join a room */
  join(room: string | string[]): this;
  /** Leave a room */
  leave(room: string | string[]): this;
  /** Leave all rooms */
  leaveAll(): void;
  /** Check if in room */
  isInRoom(room: string): boolean;

  // Broadcasting
  /** Broadcast to other sockets */
  broadcast: BroadcastOperator;
  /** Target specific rooms */
  to(room: string | string[]): BroadcastOperator;
  /** Alias for to() */
  in(room: string | string[]): BroadcastOperator;

  // Pub/Sub & Sending
  /** Send raw data */
  send(data: string | ArrayBuffer | Uint8Array, compress?: boolean): number;
  /** Publish to topic */
  publish(
    topic: string,
    data: string | ArrayBuffer | Uint8Array,
    compress?: boolean
  ): number;
  /** Subscribe to topic */
  subscribe(topic: string): void;
  /** Unsubscribe from topic */
  unsubscribe(topic: string): void;
  /** Check subscription */
  isSubscribed(topic: string): boolean;

  // Utility
  /** Disconnect socket */
  disconnect(close?: boolean): this;
  /** Cork multiple operations */
  cork<T>(callback: (ws: ServerWebSocket<WebSocketData>) => T): T;
  /** Compress next message */
  compress(compress: boolean): this;
  /** Mark next message as volatile */
  get volatile(): this;

  // Timeout
  /** Set timeout for acknowledgment */
  timeout(timeout: number): this;

  // Internal methods
  _handleEvent(event: string, data?: any, ackId?: string): void;
  _handleAck(ackId: string, data?: any, error?: string): void;
  _destroy(): void;
}

/**
 * WebSocket server interface
 */
export interface ArcanaJSIOServer {
  // Core methods
  /** Register event handler */
  on<T = any>(event: string, handler: EventHandler<T>): this;
  /** Register one-time event handler */
  once<T = any>(event: string, handler: EventHandler<T>): this;
  /** Remove event handler */
  off(event: string, handler?: EventHandler): this;
  /** Emit to all sockets */
  emit<T = any>(event: string, data?: T, options?: BroadcastOptions): this;

  // Namespace methods
  /** Create/get namespace */
  of(namespace: string): ArcanaJSIOServer;

  // Room methods
  /** Target specific rooms */
  to(room: string | string[]): BroadcastOperator;
  /** Alias for to() */
  in(room: string | string[]): BroadcastOperator;
  /** Exclude specific sockets */
  except(socketIds: string | string[]): BroadcastOperator;

  // Operations
  /** Close server */
  close(): Promise<void>;
  /** Bind to Bun server */
  bind(server: any): void;
  /** Use middleware */
  use(middleware: WebSocketMiddleware): this;

  // Socket access
  /** All connected sockets */
  readonly sockets: Map<string, ArcanaJSSocket>;
  /** Server engine reference */
  engine: any;
  /** Namespace name */
  readonly name: string;
  /** Adapter for room management */
  adapter: Adapter;

  // Socket management
  /** Get sockets in rooms */
  socketsJoin(room: string | string[]): void;
  /** Make sockets leave rooms */
  socketsLeave(room: string | string[]): void;
  /** Disconnect all sockets */
  disconnectSockets(close?: boolean): void;
  /** Fetch all socket instances */
  fetchSockets(): Promise<ArcanaJSSocket[]>;
  /** Get server-wide socket count */
  serverSideEmit(event: string, ...args: any[]): void;

  // Internal methods
  createSocket(
    ws: ServerWebSocket<WebSocketData>,
    req: Request
  ): ArcanaJSSocket;
  removeSocket(socketId: string): void;
  handleMessage(
    socket: ArcanaJSSocket,
    message: string | ArrayBuffer | Uint8Array
  ): void;
  publish(
    topic: string,
    message: string | ArrayBuffer | Uint8Array,
    compress?: boolean
  ): number;
}

/**
 * WebSocket statistics
 */
export interface WebSocketStats {
  /** Total connections */
  totalConnections: number;
  /** Active connections */
  activeConnections: number;
  /** Failed connections */
  failedConnections: number;
  /** Total messages sent */
  messagesSent: number;
  /** Total messages received */
  messagesReceived: number;
  /** Total bytes sent */
  bytesSent: number;
  /** Total bytes received */
  bytesReceived: number;
  /** Average message size */
  avgMessageSize: number;
  /** Peak connections */
  peakConnections: number;
  /** Uptime in seconds */
  uptime: number;
}
