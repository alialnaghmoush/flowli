import { FlowliDriverError } from "../core/errors.js";
import type {
  FlowliContextRecord,
  FlowliInspectSurface,
  FlowliRuntimeInternals,
  JobsRecord,
} from "../core/types.js";

export function createInspectSurface<
  TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
>(internals: FlowliRuntimeInternals<TJobs, TContext>): FlowliInspectSurface {
  return {
    async getJob(id) {
      return requireDriver().getJob(id);
    },
    async getSchedule(key) {
      return requireDriver().getSchedule(key);
    },
    async getQueueCounts() {
      return requireDriver().getQueueCounts();
    },
    async getJobsByState(state, options) {
      return requireDriver().getJobsByState(state, options);
    },
    async getSchedules(options) {
      return requireDriver().getSchedules(options);
    },
  };

  function requireDriver() {
    if (!internals.driver) {
      throw new FlowliDriverError(
        "Inspection APIs require a Flowli runtime with a configured driver.",
      );
    }

    return internals.driver;
  }
}
