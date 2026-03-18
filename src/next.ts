/**
 * The `flowli/next` entrypoint provides lightweight helpers for Next.js route
 * handlers and server actions.
 */
export {
  type NextActionHandler,
  type NextActionTools,
  type NextRouteContext,
  type NextRouteHandler,
  type NextRouteHandlerArgs,
  type NextRouteParams,
  nextAction,
  nextRoute,
} from "./integrations/next.js";
