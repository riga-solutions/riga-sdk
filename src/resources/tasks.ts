/**
 * tasks.* — propose, list.
 *
 * REST (SDK 0.2.0):
 *   client.tasks.propose(...) → POST /api/v1/tasks
 *   client.tasks.list(...)    → GET  /api/v1/tasks
 */

import { tasksV1ControllerPropose, tasksV1ControllerList } from '../generated/index.js';
import { ClientContext, callApi, GeneratedFn } from '../http.js';
import { TaskCreatedResponse, TaskListPage } from '../types.js';

export interface TaskProposeParams {
  dataroom_id: string;
  type: string;
  title: string;
  description?: string;
  party_id?: string;
  document_id?: string;
  folder_id?: string;
  due_date?: string;
  priority?: 'low' | 'normal' | 'high';
  config?: Record<string, unknown>;
}

export interface TaskListParams {
  /** Omit for a cross-dataroom sweep of the agent’s assigned tasks. */
  dataroom_id?: string;
  status?: string;
  type?: string;
  limit?: number;
  cursor?: string;
}

export class TasksResource {
  constructor(private readonly ctx: ClientContext) {}

  async propose(params: TaskProposeParams, opts: { idempotencyKey?: string } = {}): Promise<TaskCreatedResponse> {
    return callApi<TaskCreatedResponse>(
      this.ctx,
      tasksV1ControllerPropose as unknown as GeneratedFn,
      { body: params },
      opts.idempotencyKey,
    );
  }

  async list(params: TaskListParams = {}): Promise<TaskListPage> {
    const query: Record<string, unknown> = {};
    if (params.dataroom_id) query.dataroom_id = params.dataroom_id;
    if (params.status) query.status = params.status;
    if (params.type) query.type = params.type;
    if (params.limit != null) query.limit = params.limit;
    if (params.cursor) query.cursor = params.cursor;
    return callApi<TaskListPage>(this.ctx, tasksV1ControllerList as unknown as GeneratedFn, { query });
  }
}
