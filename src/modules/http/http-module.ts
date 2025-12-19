/**
 * ArcanaJS HTTP Module
 *
 * HTTP server integration with Bun.serve.
 */

import type { Application } from "../../core/application";
import type { ArcanaJSKernel, ArcanaJSModule } from "../../core/kernel";

/**
 * Server options
 */
export interface ServerOptions {
  port?: number;
  hostname?: string;
  development?: boolean;
  maxRequestBodySize?: number;
}

/**
 * HTTP Server wrapper
 */
export class HttpServer {
  private _server?: ReturnType<typeof Bun.serve>;
  private _app: Application;
  private _options: ServerOptions;

  constructor(app: Application, options: ServerOptions = {}) {
    this._app = app;
    this._options = options;
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    const port = this._options.port || 3000;
    const hostname = this._options.hostname || "0.0.0.0";

    // Run onStart hooks
    await this._app.runStartHooks();

    this._server = Bun.serve({
      port,
      hostname,
      development: this._options.development,
      maxRequestBodySize: this._options.maxRequestBodySize,

      fetch: (request) => {
        return this._app.fetch(request);
      },

      error: (error) => {
        console.error("[ArcanaJS] Server error:", error);
        return new Response(
          JSON.stringify({
            error: "Internal Server Error",
            message: this._options.development ? error.message : undefined,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      },
    });

    // Setup graceful shutdown
    this._setupShutdown();
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this._server) return;

    // Run onStop hooks
    await this._app.runStopHooks();

    this._server.stop();
    this._server = undefined;
  }

  /**
   * Get the server port
   */
  get port(): number {
    return this._server?.port || this._options.port || 3000;
  }

  /**
   * Get the server hostname
   */
  get hostname(): string {
    return this._server?.hostname || this._options.hostname || "0.0.0.0";
  }

  /**
   * Get the server URL
   */
  get url(): string {
    return `http://${this.hostname}:${this.port}`;
  }

  /**
   * Check if server is running
   */
  get running(): boolean {
    return !!this._server;
  }

  /**
   * Setup graceful shutdown handlers
   */
  private _setupShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(
        `\n[ArcanaJS] Received ${signal}, shutting down gracefully...`
      );
      await this.stop();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }
}

/**
 * HttpModule - ArcanaJS module for HTTP server
 */
export class HttpModule implements ArcanaJSModule {
  readonly name = "http";
  readonly version = "1.0.0";
  readonly dependencies = ["router", "middleware"];

  private _server?: HttpServer;

  init(kernel: ArcanaJSKernel): void {
    // HTTP module is ready
  }

  /**
   * Create a server instance
   */
  createServer(app: Application, options?: ServerOptions): HttpServer {
    this._server = new HttpServer(app, options);
    return this._server;
  }

  /**
   * Get the current server
   */
  get server(): HttpServer | undefined {
    return this._server;
  }
}

/**
 * Serve an application
 */
export async function serve(
  app: Application,
  options: ServerOptions = {}
): Promise<HttpServer> {
  const server = new HttpServer(app, options);
  await server.start();
  return server;
}

/**
 * Patch the listen method on Application prototype
 */
export function patchListen(proto: any): void {
  proto.listen = async function (
    this: Application,
    port: number,
    callback?: () => void
  ): Promise<HttpServer> {
    const server = await serve(this, { port });
    if (callback) callback();
    return server;
  };
}
