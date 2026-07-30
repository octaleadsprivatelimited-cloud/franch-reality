// Server-side error capture. Next.js calls onRequestError for every uncaught error
// in a route handler / server component / server action. We emit a single-line
// structured JSON log so Azure Container Apps' log stream is queryable, and so a
// real APM (Sentry / Application Insights) can be dropped in later with one change.

interface ErrorRequest {
  path?: string;
  method?: string;
}
interface ErrorContext {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
}

export function onRequestError(
  err: unknown,
  request: ErrorRequest,
  context: ErrorContext,
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      event: "request_error",
      message,
      method: request?.method,
      path: request?.path,
      route: context?.routePath,
      routerKind: context?.routerKind,
      routeType: context?.routeType,
      stack,
    }),
  );
}
