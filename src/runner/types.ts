import type {
  FlowliContextRecord,
  FlowliRuntime,
  JobsRecord,
  PersistedJobError,
} from "../core/types.js";

export interface RunnerHooks {
  readonly onJobStarted?: (
    jobId: string,
    jobName: string,
  ) => void | Promise<void>;
  readonly onJobCompleted?: (
    jobId: string,
    jobName: string,
  ) => void | Promise<void>;
  readonly onJobFailed?: (
    jobId: string,
    jobName: string,
    error: PersistedJobError,
  ) => void | Promise<void>;
  readonly onJobRetryScheduled?: (
    jobId: string,
    jobName: string,
    retryAt: number,
    error: PersistedJobError,
  ) => void | Promise<void>;
}

export interface RunnerOptions<
  TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
> {
  readonly flowli: FlowliRuntime<TJobs, TContext>;
  readonly concurrency?: number;
  readonly pollIntervalMs?: number;
  readonly leaseMs?: number;
  readonly maxJobsPerTick?: number;
  readonly hooks?: RunnerHooks;
}

export interface FlowliRunner {
  readonly running: boolean;
  runOnce(): Promise<number>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
