import path from "node:path";

export interface ViewOptions {
  defaultEngine?: string;
  root: string | string[];
  engines: Record<
    string,
    (path: string, options: any) => Promise<string> | string
  >;
}

export class View {
  public name: string;
  public ext: string;
  public path: string | null = null;
  public engine: (path: string, options: any) => Promise<string> | string;

  constructor(name: string, options: ViewOptions) {
    this.name = name;
    this.ext = path.extname(name);

    if (!this.ext && !options.defaultEngine) {
      throw new Error(
        "No default engine was specified and no extension was provided."
      );
    }

    if (!this.ext) {
      this.ext =
        options.defaultEngine![0] !== "."
          ? "." + options.defaultEngine
          : options.defaultEngine!;
      this.name += this.ext;
    }

    this.engine = options.engines[this.ext];
    if (!this.engine) {
      throw new Error(`No engine registered for ${this.ext}`);
    }
  }

  async resolvePath(root: string | string[]): Promise<string | null> {
    const roots = Array.isArray(root) ? root : [root];
    for (const r of roots) {
      const loc = path.resolve(r, this.name);
      if (await Bun.file(loc).exists()) {
        this.path = loc;
        return loc;
      }

      // Try index file if name is a directory
      const indexLoc = path.join(
        path.resolve(r, path.basename(this.name, this.ext)),
        `index${this.ext}`
      );
      if (await Bun.file(indexLoc).exists()) {
        this.path = indexLoc;
        return indexLoc;
      }
    }
    return null;
  }

  async render(options: any): Promise<string> {
    if (!this.path) {
      throw new Error(`Failed to lookup view "${this.name}"`);
    }
    return await this.engine(this.path, options);
  }
}
