import type {
  FlowliContextRecord,
  FlowliRuntime,
  JobsRecord,
} from "../core/types.js";

/** A minimal route params record compatible with Next.js route handlers. */
export type NextRouteParams = Record<
  string,
  string | ReadonlyArray<string> | undefined
>;

/** The request context object supplied by Next.js route handlers. */
export interface NextRouteContext<
  TParams extends NextRouteParams = NextRouteParams,
> {
  readonly params?: TParams | Promise<TParams>;
}

/** Arguments passed to a `nextRoute()` handler. */
export interface NextRouteHandlerArgs<
  TFlowli,
  TParams extends NextRouteParams = NextRouteParams,
  TRequest extends Request = Request,
> {
  readonly request: TRequest;
  readonly context: NextRouteContext<TParams>;
  readonly params: TParams | undefined;
  readonly flowli: TFlowli;
}

/** A typed handler for the `nextRoute()` integration helper. */
export type NextRouteHandler<
  TFlowli,
  TParams extends NextRouteParams = NextRouteParams,
  TRequest extends Request = Request,
  TResult = Response,
> = (
  args: NextRouteHandlerArgs<TFlowli, TParams, TRequest>,
) => TResult | Promise<TResult>;

/** Tools injected into a `nextAction()` handler. */
export interface NextActionTools<TFlowli> {
  readonly flowli: TFlowli;
}

/** A typed handler for the `nextAction()` integration helper. */
export type NextActionHandler<
  TFlowli,
  TArgs extends ReadonlyArray<unknown>,
  TResult,
> = (
  tools: NextActionTools<TFlowli>,
  ...args: TArgs
) => TResult | Promise<TResult>;

/** Wraps a Next.js route handler with access to an existing Flowli runtime. */
export function nextRoute<
  TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
  TParams extends NextRouteParams = NextRouteParams,
  TRequest extends Request = Request,
  TResult = Response,
>(
  flowli: FlowliRuntime<TJobs, TContext>,
  handler: NextRouteHandler<
    FlowliRuntime<TJobs, TContext>,
    TParams,
    TRequest,
    TResult
  >,
): (
  request: TRequest,
  context?: NextRouteContext<TParams>,
) => Promise<Awaited<TResult>> {
  return async (
    request: TRequest,
    context: NextRouteContext<TParams> = {},
  ): Promise<Awaited<TResult>> => {
    const params = context.params ? await context.params : undefined;

    return await handler({
      request,
      context,
      params,
      flowli,
    });
  };
}

/** Wraps a Next.js server action with access to an existing Flowli runtime. */
export function nextAction<
  TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
  TArgs extends ReadonlyArray<unknown>,
  TResult,
>(
  flowli: FlowliRuntime<TJobs, TContext>,
  handler: NextActionHandler<FlowliRuntime<TJobs, TContext>, TArgs, TResult>,
): (...args: TArgs) => Promise<Awaited<TResult>> {
  return async (...args: TArgs): Promise<Awaited<TResult>> =>
    await handler({ flowli }, ...args);
}
