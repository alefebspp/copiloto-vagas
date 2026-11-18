import type { Job, StageEvent } from "../job.js";

// Events are appended and removed one by one instead of saving the whole job,
// so two concurrent writes never overwrite each other (ADR-003).
export interface JobRepository {
  create(job: Job): Promise<void>;
  findById(id: string): Promise<Job | null>;
  appendEvent(jobId: string, event: StageEvent): Promise<void>;
  removeEvent(jobId: string, eventId: string): Promise<void>;
}
