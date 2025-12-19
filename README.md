# ArcanaJS

A hyper-lightweight, modern web framework built from the ground up for [**Bun**](https://bun.com). Pure TypeScript, zero-overhead, and designed for simplicity.

## Features

- **Fast**: Optimized for Bun's native performance.
- **Type-Safe**: First-class TypeScript support with clean, intuitive types.
- **Extensible**: Simple plugin and extension system.
- **Pro Lifecycle Hooks**: Built-in support for `onStart`, `onStop`, `beforeRequest`, `afterRequest`, `beforeResponse`, `afterResponse`, `onSuccess`, and `onError`.
- **Minimalist**: Core library focused on speed and developer experience.

## Quick Start

```typescript
import arcanajs, { type Request, type Response } from "@arcanajs/server";

const app = arcanajs();

app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "ArcanaJS is running on Bun!",
  });
});

app.listen(3000, () => {
  console.log("Server listening on http://localhost:3000");
});
```

## Core Philosophy

ArcanaJS is designed for developers who value performance and clean code. It leverages Bun's native APIs (like `Bun.serve` and `Bun.file`) to deliver a high-performance experience without the weight of legacy abstractions.

## License

MIT
