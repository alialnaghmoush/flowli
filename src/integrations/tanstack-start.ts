import type {
  FlowliContextRecord,
  FlowliRuntime,
  JobsRecord,
} from "../core/types.js";

/** A minimal params record compatible with TanStack Start server routes. */
export type TanStackStartRouteParams = Record<
  string,
  string | ReadonlyArray<string> | undefined
>;

/** The generic server route context provided by TanStack Start. */
export interface TanStackStartRouteContext {
  readonly [key: PropertyKey]: unknown;
}

/** Arguments passed to a `tanstackStartRoute()` handler. */
export interface TanStackStartRouteHandlerArgs<
  TFlowli,
  TParams extends TanStackStartRouteParams = TanStackStartRouteParams,
  TContext extends TanStackStartRouteContext = TanStackStartRouteContext,
  TRequest extends Request = Request,
> {
  readonly request: TRequest;
  readonly params: TParams;
  readonly context: TContext;
  readonly flowli: TFlowli;
}

/** A typed handler for TanStack Start route integration. */
export type TanStackStartRouteHandler<
  TFlowli,
  TParams extends TanStackStartRouteParams = TanStackStartRouteParams,
  TContext extends TanStackStartRouteContext = TanStackStartRouteContext,
  TRequest extends Request = Request,
  TResult = Response,
> = (
  args: TanStackStartRouteHandlerArgs<TFlowli, TParams, TContext, TRequest>,
) => TResult | Promise<TResult>;

/** Tools injected into a TanStack Start server function handler. */
export interface TanStackStartServerFnTools<TFlowli> {
  readonly flowli: TFlowli;
}

type StripFlowli<TArgs extends object> = Omit<
  TArgs,
  keyof TanStackStartServerFnTools<unknown>
>;

/** A typed handler for TanStack Start server function integration. */
export type TanStackStartServerFnHandler<
  TFlowli,
  TArgs extends TanStackStartServerFnTools<TFlowli>,
  TResult,
> = (args: TArgs) => TResult | Promise<TResult>;

/** Wraps a TanStack Start route with access to an existing Flowli runtime. */
export function tanstackStartRoute<
  TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
  TParams extends TanStackStartRouteParams = TanStackStartRouteParams,
  TRouteContext extends TanStackStartRouteContext = TanStackStartRouteContext,
  TRequest extends Request = Request,
  TResult = Response,
>(
  flowli: FlowliRuntime<TJobs, TContext>,
  handler: TanStackStartRouteHandler<
    FlowliRuntime<TJobs, TContext>,
    TParams,
    TRouteContext,
    TRequest,
    TResult
  >,
): (
  args: Omit<
    TanStackStartRouteHandlerArgs<
      FlowliRuntime<TJobs, TContext>,
      TParams,
      TRouteContext,
      TRequest
    >,
    "flowli"
  >,
) => Promise<Awaited<TResult>> {
  return async (args): Promise<Awaited<TResult>> =>
    await handler({
      ...args,
      flowli,
    });
}

/** Wraps a TanStack Start server function with Flowli runtime access. */
export function tanstackStartServerFn<
  TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
  TArgs extends TanStackStartServerFnTools<FlowliRuntime<TJobs, TContext>>,
  TResult,
>(
  flowli: FlowliRuntime<TJobs, TContext>,
  handler: TanStackStartServerFnHandler<
    FlowliRuntime<TJobs, TContext>,
    TArgs,
    TResult
  >,
): (args: StripFlowli<TArgs>) => Promise<Awaited<TResult>> {
  return async (args: StripFlowli<TArgs>): Promise<Awaited<TResult>> =>
    await handler({
      ...args,
      flowli,
    } as TArgs);
}
