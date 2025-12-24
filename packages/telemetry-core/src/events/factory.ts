/**
 * Event Factory
 * 
 * Utility functions for creating properly structured telemetry events
 */

import { v4 as uuidv4 } from 'uuid';
import {
  EventTypes,
  EventStatus,
  NodeContext,
  TelemetryEvent,
  WorkflowStartedEvent,
  WorkflowCompletedEvent,
  WorkflowFailedEvent,
  NodeStartedEvent,
  NodeCompletedEvent,
  NodeFailedEvent,
  EvalCompletedEvent,
  EvalMetrics,
  CustomEvent,
  LLMRequestedEvent,
  LLMRespondedEvent,
} from './types';

// ============ Context Interface ============

export interface ExecutionContext {
  execution_id: string;
  workflow_id: string;
  workflow_name?: string;
  run_id?: string;
  session_id?: string | null;
  metadata?: Record<string, unknown>;
}

// ============ Base Event Builder ============

function createBaseEvent(
  context: ExecutionContext,
  eventType: string,
  status: EventStatus
): Omit<TelemetryEvent, 'payload'> {
  return {
    event_id: uuidv4(),
    event_type: eventType,
    timestamp: new Date().toISOString(),
    run_id: context.run_id || context.execution_id,
    workflow_id: context.workflow_id,
    workflow_name: context.workflow_name,
    execution_id: context.execution_id,
    session_id: context.session_id,
    status,
    metadata: context.metadata,
  };
}

// ============ Workflow Event Factories ============

export function createWorkflowStartedEvent(
  context: ExecutionContext,
  options: { mode?: string; retry_of?: string; is_manual?: boolean } = {}
): WorkflowStartedEvent {
  return {
    ...createBaseEvent(context, EventTypes.WORKFLOW_STARTED, 'started'),
    event_type: EventTypes.WORKFLOW_STARTED,
    status: 'started',
    payload: {
      mode: options.mode,
      retry_of: options.retry_of,
      is_manual: options.is_manual,
    },
  };
}

export function createWorkflowCompletedEvent(
  context: ExecutionContext,
  durationMs: number,
  nodeCount: number,
  mode?: string
): WorkflowCompletedEvent {
  return {
    ...createBaseEvent(context, EventTypes.WORKFLOW_COMPLETED, 'completed'),
    event_type: EventTypes.WORKFLOW_COMPLETED,
    status: 'completed',
    duration_ms: durationMs,
    payload: {
      node_count: nodeCount,
      mode,
    },
  };
}

export function createWorkflowFailedEvent(
  context: ExecutionContext,
  durationMs: number,
  error: {
    message: string;
    node?: string;
    type?: string;
    stack?: string;
  }
): WorkflowFailedEvent {
  return {
    ...createBaseEvent(context, EventTypes.WORKFLOW_FAILED, 'failed'),
    event_type: EventTypes.WORKFLOW_FAILED,
    status: 'failed',
    duration_ms: durationMs,
    payload: {
      error_message: error.message,
      error_node: error.node,
      error_type: error.type,
      stack_trace: error.stack,
    },
  };
}

// ============ Node Event Factories ============

export function createNodeStartedEvent(
  context: ExecutionContext,
  nodeContext: NodeContext,
  inputItemsCount?: number
): NodeStartedEvent {
  return {
    ...createBaseEvent(context, EventTypes.NODE_STARTED, 'started'),
    event_type: EventTypes.NODE_STARTED,
    status: 'started',
    node_context: nodeContext,
    payload: {
      input_items_count: inputItemsCount,
    },
  };
}

export function createNodeCompletedEvent(
  context: ExecutionContext,
  nodeContext: NodeContext,
  durationMs: number,
  outputItemsCount?: number
): NodeCompletedEvent {
  return {
    ...createBaseEvent(context, EventTypes.NODE_COMPLETED, 'completed'),
    event_type: EventTypes.NODE_COMPLETED,
    status: 'completed',
    node_context: nodeContext,
    duration_ms: durationMs,
    payload: {
      output_items_count: outputItemsCount,
    },
  };
}

export function createNodeFailedEvent(
  context: ExecutionContext,
  nodeContext: NodeContext,
  durationMs: number,
  error: { message: string; type?: string }
): NodeFailedEvent {
  return {
    ...createBaseEvent(context, EventTypes.NODE_FAILED, 'failed'),
    event_type: EventTypes.NODE_FAILED,
    status: 'failed',
    node_context: nodeContext,
    duration_ms: durationMs,
    payload: {
      error_message: error.message,
      error_type: error.type,
    },
  };
}

// ============ Evaluation Event Factory ============

export function createEvalCompletedEvent(
  context: ExecutionContext,
  score: number,
  labels: string[],
  reasons: string[],
  metrics: EvalMetrics
): EvalCompletedEvent {
  return {
    ...createBaseEvent(context, EventTypes.EVAL_COMPLETED, 'completed'),
    event_type: EventTypes.EVAL_COMPLETED,
    status: 'completed',
    payload: {
      score,
      labels,
      reasons,
      metrics,
    },
  };
}

// ============ LLM Event Factories ============

export function createLLMRequestedEvent(
  context: ExecutionContext,
  nodeContext: NodeContext,
  options: { provider?: string; model?: string; prompt_tokens?: number }
): LLMRequestedEvent {
  return {
    ...createBaseEvent(context, EventTypes.LLM_REQUESTED, 'started'),
    event_type: EventTypes.LLM_REQUESTED,
    status: 'started',
    node_context: nodeContext,
    payload: {
      provider: options.provider,
      model: options.model,
      prompt_tokens: options.prompt_tokens,
    },
  };
}

export function createLLMRespondedEvent(
  context: ExecutionContext,
  nodeContext: NodeContext,
  durationMs: number,
  options: {
    provider?: string;
    model?: string;
    completion_tokens?: number;
    total_tokens?: number;
  }
): LLMRespondedEvent {
  return {
    ...createBaseEvent(context, EventTypes.LLM_RESPONDED, 'completed'),
    event_type: EventTypes.LLM_RESPONDED,
    status: 'completed',
    node_context: nodeContext,
    duration_ms: durationMs,
    payload: {
      provider: options.provider,
      model: options.model,
      completion_tokens: options.completion_tokens,
      total_tokens: options.total_tokens,
    },
  };
}

// ============ Custom Event Factory ============

export function createCustomEvent(
  context: ExecutionContext,
  name: string,
  data?: Record<string, unknown>,
  nodeContext?: NodeContext
): CustomEvent {
  const event: CustomEvent = {
    ...createBaseEvent(context, EventTypes.CUSTOM, 'completed'),
    event_type: EventTypes.CUSTOM,
    status: 'completed',
    payload: {
      name,
      data,
    },
  };

  if (nodeContext) {
    event.node_context = nodeContext;
  }

  return event;
}
