import type { Plugin } from "../types";
import type { Application } from "../core/application";
import type { ArcanaJSIOServer } from "../modules/websocket/types";
import { createIOServer } from "../modules/websocket";

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

export function websocketPlugin(options: WebSocketOptions = {}): Plugin {
    let io: ArcanaJSIOServer | null = null;

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
            app.extend("application", "io", () => io);
            app.extend("application", "websocket", () => io);
            
            // Apply the extension immediately
            (app as any).io = () => io;
            (app as any).websocket = () => io;

            // Handle cleanup on app stop
            app.onStop(() => {
                if (io) {
                    io.close();
                    io = null;
                }
            });

            // Store io instance for server access
            (app as any)._wsInstance = io;
        }
    };
}

export function getWebSocketInstance(app: Application): ArcanaJSIOServer | null {
    return (app as any)._wsInstance || null;
}
