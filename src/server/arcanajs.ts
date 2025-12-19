import type { Application } from "../core/application";

export async function serve(app: Application, options: { port?: number } = {}) {
  const port = options.port || 3000;

  await app.runStartHooks();

  const server = Bun.serve({
    port,
    fetch(req) {
      return app.fetch(req);
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
