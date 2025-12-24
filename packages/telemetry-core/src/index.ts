/**
 * n8n Telemetry SDK - Core Package
 * 
 * Provides event types, transport layer, and evaluation for n8n workflow telemetry
 */

// Events
export * from './events';

// Transport
export * from './transport';

// Evaluator
export * from './evaluator';

// Re-export commonly used items at top level
export {
  EventTypes,
  TelemetryEvent,
  WorkflowStartedEvent,
  WorkflowCompletedEvent,
  WorkflowFailedEvent,
  NodeStartedEvent,
  NodeCompletedEvent,
  NodeFailedEvent,
  EvalCompletedEvent,
  NodeContext,
  EvalMetrics,
} from './events/types';

export {
  ExecutionContext,
  createWorkflowStartedEvent,
  createWorkflowCompletedEvent,
  createWorkflowFailedEvent,
  createNodeStartedEvent,
  createNodeCompletedEvent,
  createNodeFailedEvent,
  createEvalCompletedEvent,
  createCustomEvent,
} from './events/factory';

export { Transport, TransportConfig } from './transport/base';
export { FileTransport, FileTransportConfig } from './transport/file';
export { HttpTransport, HttpTransportConfig } from './transport/http';
export { MultiTransport } from './transport/multi';

export {
  WorkflowEvaluator,
  EvaluatorConfig,
  EvaluationResult,
  createEvaluator,
  evaluateExecution,
} from './evaluator/evaluator';
