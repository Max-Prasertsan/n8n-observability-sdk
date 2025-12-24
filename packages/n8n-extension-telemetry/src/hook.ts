/**
 * Telemetry Hook
 * 
 * The core hook/extension that integrates with n8n's execution lifecycle
 * to capture workflow and node start/end events.
 * 
 * IMPORTANT: n8n Hook Integration Notes
 * =====================================
 * 
 * n8n provides several integration points for extending functionality:
 * 
 * 1. External Hooks (n8n Enterprise / Custom builds):
 *    - workflowExecuteBefore / workflowExecuteAfter
 *    - nodeExecuteBefore / nodeExecuteAfter
 *    - These require modifying n8n's configuration or using enterprise features
 * 
 * 2. Workflow Events via Webhook/Execution Webhooks:
 *    - Can be configured per workflow
 *    - Limited to workflow-level events
 * 
 * 3. Custom Nodes (Community approach - what this SDK primarily uses):
 *    - Wrapper nodes that capture timing at specific points
 *    - Telemetry Config/Emit nodes for explicit instrumentation
 * 
 * This module provides a TelemetryHook class that can be:
 * - Integrated into custom n8n builds
 * - Used with n8n's external hooks feature
 * - Called programmatically from custom nodes
 * 
 * For production use, the recommended approach is to:
 * 1. Use the community nodes (TelemetryConfig, TelemetryEmit) for explicit telemetry
 * 2. If you have access to n8n source/enterprise, integrate this hook for automatic capture
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Transport,
  FileTransport,
  HttpTransport,
  MultiTransport,
  TelemetryEvent,
  NodeContext,
  ExecutionContext,
  createWorkflowStartedEvent,
  createWorkflowCompletedEvent,
  createWorkflowFailedEvent,
  createNodeStartedEvent,
  createNodeCompletedEvent,
  createNodeFailedEvent,
  WorkflowEvaluator,
  EvaluatorConfig,
} from '@n8n-telemetry/core';
import { ExecutionTracker, executionTracker } from './tracker';

// ============ Hook Configuration ============

export interface TelemetryHookConfig {
  filePath?: string;
  httpEndpoint?: string;
  enableEvaluation?: boolean;
  evaluatorConfig?: EvaluatorConfig;
  capturePayloads?: boolean;
  redactPayloads?: boolean;
  redactFields?: string[];
  defaultSessionId?: string;
  defaultMetadata?: Record<string, unknown>;
  debug?: boolean;
}

const DEFAULT_CONFIG: TelemetryHookConfig = {
  filePath: './data/events.jsonl',
  enableEvaluation: true,
  capturePayloads: true,
  redactPayloads: true,
  debug: false,
};

// ============ Telemetry Hook Class ============

export class TelemetryHook {
  private config: TelemetryHookConfig;
  private transport: Transport;
  private tracker: ExecutionTracker;
  private evaluator: WorkflowEvaluator;
  private executionEvents: Map<string, TelemetryEvent[]> = new Map();
  
  constructor(config: TelemetryHookConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tracker = executionTracker;
    this.evaluator = new WorkflowEvaluator(config.evaluatorConfig);
    this.transport = this.createTransport();
  }
  
  private createTransport(): Transport {
    const transports: Transport[] = [];
    
    if (this.config.filePath) {
      transports.push(new FileTransport({
        filePath: this.config.filePath,
        createDir: true,
        redactPayloads: this.config.redactPayloads,
        redactFields: this.config.redactFields,
      }));
    }
    
    if (this.config.httpEndpoint) {
      transports.push(new HttpTransport({
        endpoint: this.config.httpEndpoint,
        buffered: true,
        redactPayloads: this.config.redactPayloads,
        redactFields: this.config.redactFields,
      }));
    }
    
    if (transports.length === 0) {
      transports.push(new FileTransport({
        filePath: './data/events.jsonl',
        createDir: true,
      }));
    }
    
    return transports.length === 1 ? transports[0] : new MultiTransport(transports);
  }
  
  private getExecutionContext(executionId: string): ExecutionContext | undefined {
    const state = this.tracker.getExecution(executionId);
    if (!state) return undefined;
    
    return {
      execution_id: state.executionId,
      workflow_id: state.workflowId,
      workflow_name: state.workflowName,
      run_id: state.executionId,
      session_id: state.sessionId || this.config.defaultSessionId,
      metadata: { ...this.config.defaultMetadata, ...state.metadata },
    };
  }
  
  private async sendEvent(event: TelemetryEvent): Promise<void> {
    const executionEvents = this.executionEvents.get(event.execution_id) || [];
    executionEvents.push(event);
    this.executionEvents.set(event.execution_id, executionEvents);
    
    await this.transport.send(event);
    
    if (this.config.debug) {
      console.log(`[Telemetry] ${event.event_type}:`, JSON.stringify(event, null, 2));
    }
  }
  
  async onWorkflowStart(params: {
    executionId: string;
    workflowId: string;
    workflowName: string;
    mode?: string;
    sessionId?: string;
    isManual?: boolean;
    retryOf?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { executionId, workflowId, workflowName, mode, sessionId, isManual, retryOf, metadata } = params;
    
    this.tracker.startExecution(executionId, workflowId, workflowName, sessionId, metadata);
    this.executionEvents.set(executionId, []);
    
    const context = this.getExecutionContext(executionId)!;
    const event = createWorkflowStartedEvent(context, { mode, retry_of: retryOf, is_manual: isManual });
    await this.sendEvent(event);
  }
  
  async onWorkflowComplete(params: { executionId: string; mode?: string }): Promise<void> {
    const { executionId, mode } = params;
    const context = this.getExecutionContext(executionId);
    if (!context) return;
    
    const { duration, nodeCount } = this.tracker.completeExecution(executionId);
    const event = createWorkflowCompletedEvent(context, duration, nodeCount, mode);
    await this.sendEvent(event);
    
    if (this.config.enableEvaluation) {
      await this.runEvaluation(executionId, context);
    }
    
    this.cleanup(executionId);
  }
  
  async onWorkflowFail(params: { executionId: string; error: Error; errorNode?: string }): Promise<void> {
    const { executionId, error, errorNode } = params;
    const context = this.getExecutionContext(executionId);
    if (!context) return;
    
    const { duration } = this.tracker.completeExecution(executionId);
    const event = createWorkflowFailedEvent(context, duration, {
      message: error.message,
      node: errorNode,
      type: error.name,
      stack: error.stack,
    });
    await this.sendEvent(event);
    
    if (this.config.enableEvaluation) {
      await this.runEvaluation(executionId, context);
    }
    
    this.cleanup(executionId);
  }
  
  async onNodeStart(params: {
    executionId: string;
    nodeName: string;
    nodeType: string;
    nodeId?: string;
    inputItemsCount?: number;
  }): Promise<void> {
    const { executionId, nodeName, nodeType, nodeId, inputItemsCount } = params;
    const context = this.getExecutionContext(executionId);
    if (!context) return;
    
    const nodeContext: NodeContext = { node_id: nodeId, node_name: nodeName, node_type: nodeType };
    this.tracker.startNode(executionId, nodeName, nodeContext, inputItemsCount);
    
    const event = createNodeStartedEvent(context, nodeContext, inputItemsCount);
    await this.sendEvent(event);
  }
  
  async onNodeComplete(params: {
    executionId: string;
    nodeName: string;
    nodeType: string;
    nodeId?: string;
    outputItemsCount?: number;
  }): Promise<void> {
    const { executionId, nodeName, nodeType, nodeId, outputItemsCount } = params;
    const context = this.getExecutionContext(executionId);
    if (!context) return;
    
    const nodeContext: NodeContext = { node_id: nodeId, node_name: nodeName, node_type: nodeType };
    const duration = this.tracker.completeNode(executionId, nodeName);
    
    const event = createNodeCompletedEvent(context, nodeContext, duration, outputItemsCount);
    await this.sendEvent(event);
  }
  
  async onNodeFail(params: {
    executionId: string;
    nodeName: string;
    nodeType: string;
    nodeId?: string;
    error: Error;
  }): Promise<void> {
    const { executionId, nodeName, nodeType, nodeId, error } = params;
    const context = this.getExecutionContext(executionId);
    if (!context) return;
    
    const nodeContext: NodeContext = { node_id: nodeId, node_name: nodeName, node_type: nodeType };
    const duration = this.tracker.failNode(executionId, nodeName);
    
    const event = createNodeFailedEvent(context, nodeContext, duration, {
      message: error.message,
      type: error.name,
    });
    await this.sendEvent(event);
  }
  
  private async runEvaluation(executionId: string, context: ExecutionContext): Promise<void> {
    const events = this.executionEvents.get(executionId) || [];
    if (events.length === 0) return;
    
    const evalEvent = this.evaluator.evaluateAndCreateEvent(context, events);
    await this.sendEvent(evalEvent);
  }
  
  private cleanup(executionId: string): void {
    this.tracker.cleanupExecution(executionId);
    this.executionEvents.delete(executionId);
  }
  
  async close(): Promise<void> {
    await this.transport.flush();
    await this.transport.close();
  }
  
  getTransport(): Transport { return this.transport; }
  
  async queryByExecution(executionId: string): Promise<TelemetryEvent[]> {
    return this.transport.queryByExecution(executionId);
  }
}

let defaultHook: TelemetryHook | null = null;

export function getTelemetryHook(config?: TelemetryHookConfig): TelemetryHook {
  if (!defaultHook || config) {
    defaultHook = new TelemetryHook(config);
  }
  return defaultHook;
}

export function resetTelemetryHook(): void {
  if (defaultHook) {
    defaultHook.close();
    defaultHook = null;
  }
}
