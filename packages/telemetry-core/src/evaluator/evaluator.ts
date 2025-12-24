/**
 * Workflow Evaluator
 * 
 * Analyzes telemetry events from a workflow execution and produces
 * a quality score with detailed metrics and reasons
 */

import {
  TelemetryEvent,
  EventTypes,
  EvalMetrics,
  EvalCompletedEvent,
  NodeCompletedEvent,
  NodeFailedEvent,
  WorkflowCompletedEvent,
  WorkflowFailedEvent,
} from '../events/types';
import { createEvalCompletedEvent, ExecutionContext } from '../events/factory';

// ============ Evaluator Configuration ============

export interface EvaluatorConfig {
  /**
   * Maximum acceptable workflow duration in ms before penalty
   */
  maxWorkflowDurationMs?: number;
  
  /**
   * Maximum acceptable node duration in ms before penalty
   */
  maxNodeDurationMs?: number;
  
  /**
   * Penalty per failed node (subtracted from score)
   */
  failedNodePenalty?: number;
  
  /**
   * Penalty for workflow failure (sets max score)
   */
  workflowFailureMaxScore?: number;
  
  /**
   * Penalty for slow workflow (per second over threshold)
   */
  slowWorkflowPenaltyPerSecond?: number;
  
  /**
   * Penalty for slow node (per node over threshold)
   */
  slowNodePenalty?: number;
  
  /**
   * Bonus for successful completion with no issues
   */
  successBonus?: number;
}

const DEFAULT_CONFIG: Required<EvaluatorConfig> = {
  maxWorkflowDurationMs: 60000, // 1 minute
  maxNodeDurationMs: 10000,     // 10 seconds
  failedNodePenalty: 15,
  workflowFailureMaxScore: 30,
  slowWorkflowPenaltyPerSecond: 2,
  slowNodePenalty: 5,
  successBonus: 10,
};

// ============ Evaluation Result ============

export interface EvaluationResult {
  score: number;
  labels: string[];
  reasons: string[];
  metrics: EvalMetrics;
}

// ============ Evaluator Class ============

export class WorkflowEvaluator {
  private config: Required<EvaluatorConfig>;
  
  constructor(config: EvaluatorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Evaluate a set of events from a single workflow execution
   */
  evaluate(events: TelemetryEvent[]): EvaluationResult {
    const labels: string[] = [];
    const reasons: string[] = [];
    let score = 100;
    
    // Extract relevant events
    const nodeStartEvents = events.filter(e => e.event_type === EventTypes.NODE_STARTED);
    const nodeCompletedEvents = events.filter(e => e.event_type === EventTypes.NODE_COMPLETED) as NodeCompletedEvent[];
    const nodeFailedEvents = events.filter(e => e.event_type === EventTypes.NODE_FAILED) as NodeFailedEvent[];
    const workflowCompletedEvent = events.find(e => e.event_type === EventTypes.WORKFLOW_COMPLETED) as WorkflowCompletedEvent | undefined;
    const workflowFailedEvent = events.find(e => e.event_type === EventTypes.WORKFLOW_FAILED) as WorkflowFailedEvent | undefined;
    
    // Calculate metrics
    const nodeCount = nodeStartEvents.length;
    const failedNodeCount = nodeFailedEvents.length;
    
    // Calculate total duration
    let totalDurationMs = 0;
    if (workflowCompletedEvent) {
      totalDurationMs = workflowCompletedEvent.duration_ms;
    } else if (workflowFailedEvent) {
      totalDurationMs = workflowFailedEvent.duration_ms;
    }
    
    // Find slowest node
    let slowestNode: { name: string; duration_ms: number } | undefined;
    const allNodeEndEvents = [...nodeCompletedEvents, ...nodeFailedEvents];
    
    for (const nodeEvent of allNodeEndEvents) {
      if (nodeEvent.duration_ms !== undefined) {
        if (!slowestNode || nodeEvent.duration_ms > slowestNode.duration_ms) {
          slowestNode = {
            name: nodeEvent.node_context.node_name,
            duration_ms: nodeEvent.duration_ms,
          };
        }
      }
    }
    
    // Calculate average node duration
    const nodeDurations = allNodeEndEvents
      .filter(e => e.duration_ms !== undefined)
      .map(e => e.duration_ms!);
    const avgNodeDurationMs = nodeDurations.length > 0
      ? nodeDurations.reduce((a, b) => a + b, 0) / nodeDurations.length
      : 0;
    
    // ============ Apply Scoring Rules ============
    
    // Rule 1: Workflow failure caps score at 30
    if (workflowFailedEvent) {
      score = Math.min(score, this.config.workflowFailureMaxScore);
      labels.push('workflow_failed');
      reasons.push(`Workflow failed: ${workflowFailedEvent.payload.error_message}`);
      
      if (workflowFailedEvent.payload.error_node) {
        reasons.push(`Error occurred in node: ${workflowFailedEvent.payload.error_node}`);
      }
    }
    
    // Rule 2: Penalty per failed node
    if (failedNodeCount > 0) {
      const penalty = failedNodeCount * this.config.failedNodePenalty;
      score -= penalty;
      labels.push('node_failures');
      reasons.push(`${failedNodeCount} node(s) failed (-${penalty} points)`);
      
      // List failed nodes
      for (const failedNode of nodeFailedEvents) {
        reasons.push(`  - ${failedNode.node_context.node_name}: ${failedNode.payload.error_message}`);
      }
    }
    
    // Rule 3: Slow workflow penalty
    if (totalDurationMs > this.config.maxWorkflowDurationMs) {
      const overageSeconds = (totalDurationMs - this.config.maxWorkflowDurationMs) / 1000;
      const penalty = Math.floor(overageSeconds * this.config.slowWorkflowPenaltyPerSecond);
      score -= penalty;
      labels.push('slow_execution');
      reasons.push(`Workflow exceeded time threshold: ${(totalDurationMs / 1000).toFixed(2)}s > ${this.config.maxWorkflowDurationMs / 1000}s (-${penalty} points)`);
    }
    
    // Rule 4: Slow node penalty
    const slowNodes = allNodeEndEvents.filter(
      e => e.duration_ms !== undefined && e.duration_ms > this.config.maxNodeDurationMs
    );
    
    if (slowNodes.length > 0) {
      const penalty = slowNodes.length * this.config.slowNodePenalty;
      score -= penalty;
      labels.push('slow_nodes');
      reasons.push(`${slowNodes.length} node(s) exceeded time threshold (-${penalty} points)`);
      
      for (const slowNode of slowNodes) {
        reasons.push(`  - ${slowNode.node_context.node_name}: ${(slowNode.duration_ms! / 1000).toFixed(2)}s`);
      }
    }
    
    // Rule 5: Success bonus
    if (workflowCompletedEvent && failedNodeCount === 0 && slowNodes.length === 0) {
      score += this.config.successBonus;
      labels.push('clean_execution');
      reasons.push(`Clean execution with no failures (+${this.config.successBonus} points)`);
    }
    
    // Clamp score between 0 and 100
    score = Math.max(0, Math.min(100, score));
    
    // Build metrics object
    const metrics: EvalMetrics = {
      total_duration_ms: totalDurationMs,
      node_count: nodeCount,
      failed_node_count: failedNodeCount,
      slowest_node: slowestNode,
      avg_node_duration_ms: Math.round(avgNodeDurationMs),
    };
    
    // Add LLM metrics if present
    const llmEvents = events.filter(
      e => e.event_type === EventTypes.LLM_REQUESTED || e.event_type === EventTypes.LLM_RESPONDED
    );
    
    if (llmEvents.length > 0) {
      const llmResponses = events.filter(e => e.event_type === EventTypes.LLM_RESPONDED);
      
      let totalTokens = 0;
      let totalLatency = 0;
      
      for (const resp of llmResponses) {
        const payload = resp.payload as { total_tokens?: number };
        if (payload.total_tokens) {
          totalTokens += payload.total_tokens;
        }
        if (resp.duration_ms) {
          totalLatency += resp.duration_ms;
        }
      }
      
      metrics.llm_metrics = {
        total_requests: Math.floor(llmEvents.length / 2),
        total_tokens: totalTokens || undefined,
        total_latency_ms: totalLatency || undefined,
      };
    }
    
    return { score, labels, reasons, metrics };
  }
  
  /**
   * Evaluate and create an EvalCompletedEvent
   */
  evaluateAndCreateEvent(
    context: ExecutionContext,
    events: TelemetryEvent[]
  ): EvalCompletedEvent {
    const result = this.evaluate(events);
    
    return createEvalCompletedEvent(
      context,
      result.score,
      result.labels,
      result.reasons,
      result.metrics
    );
  }
}

// ============ Utility Functions ============

/**
 * Create a default evaluator instance
 */
export function createEvaluator(config?: EvaluatorConfig): WorkflowEvaluator {
  return new WorkflowEvaluator(config);
}

/**
 * Quick evaluation helper
 */
export function evaluateExecution(
  events: TelemetryEvent[],
  config?: EvaluatorConfig
): EvaluationResult {
  const evaluator = new WorkflowEvaluator(config);
  return evaluator.evaluate(events);
}
