/**
 * Common types and utilities shared between executor implementations
 */

export type LogLevel = "log" | "info" | "warn" | "error";

export class ExecutionError extends Error {
  code?: string;
  override stack: string;
  logs: Array<{ ts: number; level: LogLevel; message: string }>;

  constructor({
    message,
    stack,
    code,
    logs,
  }: {
    message?: string;
    stack?: string;
    code?: string;
    logs?: Array<{ ts: number; level: LogLevel; message: string }>;
  }) {
    super(message || "Unknown error");
    this.code = code;
    this.stack = stack || "";
    this.logs = logs || [];
  }
}

export const DEFAULT_TIMEOUT_MS = 5000; // 5 seconds
export const MAX_TIMEOUT_MS = 300000; // 300 seconds (5 minutes)

