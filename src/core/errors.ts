import type { StandardSchemaIssue } from "./types.js";

/** Base error type for all Flowli-specific failures. */
export class FlowliError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/** Raised when Flowli definitions or registry shape are invalid. */
export class FlowliDefinitionError extends FlowliError {
  constructor(message: string) {
    super("FLOWLI_DEFINITION_ERROR", message);
  }
}

/** Raised when input or meta validation fails against the configured schema. */
export class FlowliValidationError extends FlowliError {
  readonly issues: ReadonlyArray<StandardSchemaIssue>;

  constructor(message: string, issues: ReadonlyArray<StandardSchemaIssue>) {
    super("FLOWLI_VALIDATION_ERROR", message);
    this.issues = issues;
  }
}

/** Raised when a strategy is used in an invalid way for the current runtime. */
export class FlowliStrategyError extends FlowliError {
  constructor(message: string) {
    super("FLOWLI_STRATEGY_ERROR", message);
  }
}

/** Raised when a driver is missing or behaves incompatibly. */
export class FlowliDriverError extends FlowliError {
  constructor(message: string) {
    super("FLOWLI_DRIVER_ERROR", message);
  }
}

/** Raised when schedule registration or cron handling fails. */
export class FlowliSchedulingError extends FlowliError {
  constructor(message: string) {
    super("FLOWLI_SCHEDULING_ERROR", message);
  }
}
