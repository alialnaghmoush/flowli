import type {
  FlowliContextRecord,
  FlowliRuntime,
  JobsRecord,
} from "../core/types.js";

export type NextRouteParams = Record<
  string,
  string | ReadonlyArray<string> | undefined
>;

export interface NextRouteContext<
  TParams extends NextRouteParams = NextRouteParams,
> {
  readonly params?: TParams | Promise<TParams>;
}

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

export type NextRouteHandler<
  TFlowli,
  TParams extends NextRouteParams = NextRouteParams,
  TRequest extends Request = Request,
  TResult = Response,
> = (
  args: NextRouteHandlerArgs<TFlowli, TParams, TRequest>,
) => TResult | Promise<TResult>;

export interface NextActionTools<TFlowli> {
  readonly flowli: TFlowli;
}

export type NextActionHandler<
  TFlowli,
  TArgs extends ReadonlyArray<unknown>,
  TResult,
> = (
  tools: NextActionTools<TFlowli>,
  ...args: TArgs
) => TResult | Promise<TResult>;

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
