/**
 * Telemetry Event Types and Schema
 * 
 * Defines all event types for workflow and node lifecycle tracking
 */

// ============ Event Type Constants ============

export const EventTypes = {
  // Workflow lifecycle
  WORKFLOW_STARTED: 'workflow.started',
  WORKFLOW_COMPLETED: 'workflow.completed',
  WORKFLOW_FAILED: 'workflow.failed',
  
  // Node lifecycle
  NODE_STARTED: 'node.started',
  NODE_COMPLETED: 'node.completed',
  NODE_FAILED: 'node.failed',
  
  // Evaluation
  EVAL_COMPLETED: 'eval.completed',
  
  // Optional: LLM/AI events
  LLM_REQUESTED: 'llm.requested',
  LLM_RESPONDED: 'llm.responded',
  TOOL_CALLED: 'tool.called',
  TOOL_RESPONDED: 'tool.responded',
  
  // Custom events
  CUSTOM: 'custom',
} as const;

export type EventType = typeof EventTypes[keyof typeof EventTypes];

// ============ Status Types ============

export type EventStatus = 'started' | 'completed' | 'failed';

// ============ Node Context ============

export interface NodeContext {
  node_id?: string;
  node_name: string;
  node_type: string;
  node_index?: number;
}

// ============ Base Event Interface ============

export interface TelemetryEventBase {
  event_id: string;
  event_type: EventType | string;
  timestamp: string;
  run_id: string;
  workflow_id: string;
  workflow_name?: string;
  execution_id: string;
  session_id?: string | null;
  node_context?: NodeContext;
  duration_ms?: number;
  status: EventStatus;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ============ Workflow Events ============

export interface WorkflowStartedEvent extends TelemetryEventBase {
  event_type: typeof EventTypes.WORKFLOW_STARTED;
  status: 'started';
  payload: {
    mode?: string;
    retry_of?: string;
    is_manual?: boolean;
  };
}

export interface WorkflowCompletedEvent extends TelemetryEventBase {
  event_type: typeof EventTypes.WORKFLOW_COMPLETED;
  status: 'completed';
  duration_ms: number;
  payload: {
    node_count: number;
    mode?: string;
  };
}

export interface WorkflowFailedEvent extends TelemetryEventBase {
  event_type: typeof EventTypes.WORKFLOW_FAILED;
  status: 'failed';
  duration_ms: number;
  payload: {
    error_message: string;
    error_node?: string;
    error_type?: string;
    stack_trace?: string;
  };
}

// ============ Node Events ============

export interface NodeStartedEvent extends TelemetryEventBase {
  event_type: typeof EventTypes.NODE_STARTED;
  status: 'started';
  node_context: NodeContext;
  payload: {
    input_items_count?: number;
  };
}

export interface NodeCompletedEvent extends TelemetryEventBase {
  event_type: typeof EventTypes.NODE_COMPLETED;
  status: 'completed';
  node_context: NodeContext;
  duration_ms: number;
  payload: {
    output_items_count?: number;
  };
}

export interface NodeFailedEvent extends TelemetryEventBase {
  event_type: typeof EventTypes.NODE_FAILED;
  status: 'failed';
  node_context: NodeContext;
  duration_ms: number;
  payload: {
    error_message: string;
    error_type?: string;
  };
}

// ============ Evaluation Event ============

export interface EvalMetrics {
  total_duration_ms: number;
  node_count: number;
  failed_node_count: number;
  slowest_node?: {
    name: string;
    duration_ms: number;
  };
  avg_node_duration_ms?: number;
  llm_metrics?: {
    total_requests: number;
    total_tokens?: number;
    total_latency_ms?: number;
  };
}

export interface EvalCompletedEvent extends TelemetryEventBase {
  event_type: typeof EventTypes.EVAL_COMPLETED;
  status: 'completed';
  payload: {
    score: number;
    labels: string[];
    reasons: string[];
    metrics: EvalMetrics;
  };
}

// ============ LLM Events (Optional) ============

export interface LLMRequestedEvent extends TelemetryEventBase {
  event_type: typeof EventTypes.LLM_REQUESTED;
  status: 'started';
  node_context: NodeContext;
  payload: {
    provider?: string;
    model?: string;
    prompt_tokens?: number;
  };
}

export interface LLMRespondedEvent extends TelemetryEventBase {
  event_type: typeof EventTypes.LLM_RESPONDED;
  status: 'completed';
  node_context: NodeContext;
  duration_ms: number;
  payload: {
    provider?: string;
    model?: string;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

// ============ Custom Event ============

export interface CustomEvent extends TelemetryEventBase {
  event_type: typeof EventTypes.CUSTOM | string;
  payload: {
    name: string;
    data?: Record<string, unknown>;
  };
}

// ============ Union Type ============

export type TelemetryEvent =
  | WorkflowStartedEvent
  | WorkflowCompletedEvent
  | WorkflowFailedEvent
  | NodeStartedEvent
  | NodeCompletedEvent
  | NodeFailedEvent
  | EvalCompletedEvent
  | LLMRequestedEvent
  | LLMRespondedEvent
  | CustomEvent;

// ============ Event Validation ============

export function isValidEvent(event: unknown): event is TelemetryEvent {
  if (!event || typeof event !== 'object') return false;
  
  const e = event as Record<string, unknown>;
  
  return (
    typeof e.event_id === 'string' &&
    typeof e.event_type === 'string' &&
    typeof e.timestamp === 'string' &&
    typeof e.execution_id === 'string' &&
    typeof e.workflow_id === 'string' &&
    typeof e.status === 'string'
  );
}

// ============ Event Type Guards ============

export function isWorkflowEvent(event: TelemetryEvent): boolean {
  return event.event_type.startsWith('workflow.');
}

export function isNodeEvent(event: TelemetryEvent): boolean {
  return event.event_type.startsWith('node.');
}

export function isEvalEvent(event: TelemetryEvent): event is EvalCompletedEvent {
  return event.event_type === EventTypes.EVAL_COMPLETED;
}
