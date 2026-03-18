import type {
  FlowliContextRecord,
  FlowliRuntime,
  JobsRecord,
} from "../core/types.js";

export type TanStackStartRouteParams = Record<
  string,
  string | ReadonlyArray<string> | undefined
>;

export interface TanStackStartRouteContext {
  readonly [key: PropertyKey]: unknown;
}

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

export type TanStackStartRouteHandler<
  TFlowli,
  TParams extends TanStackStartRouteParams = TanStackStartRouteParams,
  TContext extends TanStackStartRouteContext = TanStackStartRouteContext,
  TRequest extends Request = Request,
  TResult = Response,
> = (
  args: TanStackStartRouteHandlerArgs<TFlowli, TParams, TContext, TRequest>,
) => TResult | Promise<TResult>;

export interface TanStackStartServerFnTools<TFlowli> {
  readonly flowli: TFlowli;
}

type StripFlowli<TArgs extends object> = Omit<
  TArgs,
  keyof TanStackStartServerFnTools<unknown>
>;

export type TanStackStartServerFnHandler<
  TFlowli,
  TArgs extends TanStackStartServerFnTools<TFlowli>,
  TResult,
> = (args: TArgs) => TResult | Promise<TResult>;

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
