import type {
  FlowliContextRecord,
  FlowliRuntime,
  JobsRecord,
  PersistedJobError,
  PersistedJobRecord,
} from "../core/types.js";

/** Lifecycle hooks emitted by the Flowli runner during async execution. */
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
  readonly onLeaseRecovered?: (
    jobId: string,
    jobName: string,
    record: PersistedJobRecord,
  ) => void | Promise<void>;
}

/** Options for constructing a Flowli runner from an existing runtime. */
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

/** The explicit async processor returned by `createRunner()`. */
export interface FlowliRunner {
  readonly running: boolean;
  runOnce(): Promise<number>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
