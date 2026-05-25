import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  status: number;
  expose: boolean;

  constructor(status: number, message: string, expose = true) {
    super(message);
    this.status = status;
    this.expose = expose;
  }
}

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, "Not found"));
}

// Express only treats a handler as an error handler when it has 4 args.
// Without _next, Express falls back to its default HTML error page.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const status = err instanceof HttpError ? err.status : 500;
  const message =
    err instanceof HttpError ? err.message : "Internal server error";

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({ error: message });
}
