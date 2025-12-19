import { Application, arcanajs as createApplication } from "./core/application";
import { Router } from "./core/router";
import { json as jsonMiddleware } from "./plugins/json";
import { static_files } from "./plugins/static";
import { patchListen } from "./server/arcanajs";

// Patch listen for compatibility
patchListen(Application.prototype);

/**
 * ArcanaJS Factory Function
 */
function createArcanaJS(): Application {
  return createApplication();
}

// Attach static methods and classes (Pro structure)
createArcanaJS.Application = Application;
createArcanaJS.Router = () => new Router();
createArcanaJS.json = jsonMiddleware;
createArcanaJS.static = static_files;

// Compatibility Exports
export const arcanajs = createArcanaJS;
export default arcanajs;

// Direct named exports
export * from "./types";
export { Application, Router };
