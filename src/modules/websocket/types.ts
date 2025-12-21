import type { ServerWebSocket, WebSocketReadyState } from "bun";

export { WebSocketReadyState, ServerWebSocket };

export interface WebSocketData {
  id: string;
  handshake: {
    time: string;
    url: string;
    headers: Record<string, string>;
    query: Record<string, string>;
  };
  rooms: Set<string>;
  auth?: any;
}

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
}

export interface WebSocketMiddleware {
  (socket: ArcanaJSSocket, next: (err?: any) => void): void;
}

export interface EventHandler<T = any> {
  (socket: ArcanaJSSocket, data?: T): void;
}

export interface BroadcastOptions {
  rooms?: string[];
  except?: string[];
  compress?: boolean;
}

export interface SocketToServerEvents {
  disconnect: (reason?: string) => void;
  error: (error: Error) => void;
}

export interface ServerToClientEvents {
  disconnect: (reason: string) => void;
  error: (error: { message: string }) => void;
  message: (data: any) => void;
}

export interface ArcanaJSSocket extends ServerWebSocket<WebSocketData> {
  id: string;
  data: WebSocketData;
  rooms: Set<string>;
  
  // Event methods
  on<T = any>(event: string, handler: EventHandler<T>): this;
  off(event: string, handler?: EventHandler): this;
  emit<T = any>(event: string, data?: T, options?: BroadcastOptions): this;
  
  // Room methods
  join(room: string): this;
  leave(room: string): this;
  leaveAll(): void;
  roomsJoined(): string[];
  isInRoom(room: string): boolean;
  
  // Utility methods
  broadcast<T = any>(event: string, data?: T, options?: BroadcastOptions): this;
  disconnect(close?: boolean): void;
  
  // Internal methods
  _handleEvent(event: string, data?: any): void;
  _destroy(): void;
  
  // Override ServerWebSocket methods with required signatures
  sendText(data: string, compress?: boolean): number;
  sendBinary(data: ArrayBuffer | Uint8Array, compress?: boolean): number;
  publishText(topic: string, data: string, compress?: boolean): number;
  publishBinary(topic: string, data: ArrayBuffer | Uint8Array, compress?: boolean): number;
  getBufferedAmount(): number;
  terminate(): void;
  ping(): number;
  pong(): number;
  cork<T = unknown>(callback: (ws: ServerWebSocket<T>) => T): T;
}

export interface ArcanaJSIOServer {
  // Core methods
  on<T = any>(event: string, handler: EventHandler<T>): this;
  off(event: string, handler?: EventHandler): this;
  emit<T = any>(event: string, data?: T, options?: BroadcastOptions): this;
  
  // Namespace methods
  of(namespace: string): ArcanaJSIOServer;
  
  // Room methods
  to(room: string | string[]): ArcanaJSIOServer;
  in(room: string | string[]): ArcanaJSIOServer;
  except(socketId: string | string[]): ArcanaJSIOServer;
  
  // Utility methods
  close(): void;
  clients(callback: (clients: ArcanaJSSocket[]) => void): void;
  sockets: Map<string, ArcanaJSSocket>;
  
  // Configuration
  use(middleware: WebSocketMiddleware): this;
  engine: any;
}

export interface Packet {
  type: string;
  data?: any;
  id?: number;
  nsp?: string;
}
