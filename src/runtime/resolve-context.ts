import type {
  FlowliContextRecord,
  FlowliContextResolver,
} from "../core/types.js";

export function createContextResolver<TContext extends FlowliContextRecord>(
  context: FlowliContextResolver<TContext>,
): () => Promise<TContext> {
  if (typeof context === "function") {
    return async () =>
      Promise.resolve((context as () => TContext | Promise<TContext>)());
  }

  return async () => context;
}
