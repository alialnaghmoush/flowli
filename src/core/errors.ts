import type { StandardSchemaIssue } from "./types.js";

export class FlowliError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class FlowliDefinitionError extends FlowliError {
  constructor(message: string) {
    super("FLOWLI_DEFINITION_ERROR", message);
  }
}

export class FlowliValidationError extends FlowliError {
  readonly issues: ReadonlyArray<StandardSchemaIssue>;

  constructor(message: string, issues: ReadonlyArray<StandardSchemaIssue>) {
    super("FLOWLI_VALIDATION_ERROR", message);
    this.issues = issues;
  }
}

export class FlowliStrategyError extends FlowliError {
  constructor(message: string) {
    super("FLOWLI_STRATEGY_ERROR", message);
  }
}

export class FlowliDriverError extends FlowliError {
  constructor(message: string) {
    super("FLOWLI_DRIVER_ERROR", message);
  }
}

export class FlowliSchedulingError extends FlowliError {
  constructor(message: string) {
    super("FLOWLI_SCHEDULING_ERROR", message);
  }
}
