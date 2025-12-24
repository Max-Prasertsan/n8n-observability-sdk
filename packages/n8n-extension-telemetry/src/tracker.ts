/**
 * Execution Tracker
 * 
 * Tracks in-flight workflow executions and their node timings
 * for accurate duration calculations
 */

import { NodeContext } from '@n8n-telemetry/core';

// ============ Timing Entry ============

export interface TimingEntry {
  startTime: number;
  nodeContext?: NodeContext;
  inputItemsCount?: number;
}

// ============ Execution State ============

export interface ExecutionState {
  executionId: string;
  workflowId: string;
  workflowName: string;
  sessionId?: string;
  startTime: number;
  nodeTimings: Map<string, TimingEntry>;
  completedNodes: string[];
  failedNodes: string[];
  metadata?: Record<string, unknown>;
}

// ============ Execution Tracker ============

export class ExecutionTracker {
  private executions: Map<string, ExecutionState> = new Map();
  
  /**
   * Start tracking a new workflow execution
   */
  startExecution(
    executionId: string,
    workflowId: string,
    workflowName: string,
    sessionId?: string,
    metadata?: Record<string, unknown>
  ): ExecutionState {
    const state: ExecutionState = {
      executionId,
      workflowId,
      workflowName,
      sessionId,
      startTime: Date.now(),
      nodeTimings: new Map(),
      completedNodes: [],
      failedNodes: [],
      metadata,
    };
    
    this.executions.set(executionId, state);
    return state;
  }
  
  /**
   * Get an execution state
   */
  getExecution(executionId: string): ExecutionState | undefined {
    return this.executions.get(executionId);
  }
  
  /**
   * Start tracking a node within an execution
   */
  startNode(
    executionId: string,
    nodeName: string,
    nodeContext: NodeContext,
    inputItemsCount?: number
  ): TimingEntry | undefined {
    const state = this.executions.get(executionId);
    if (!state) return undefined;
    
    const entry: TimingEntry = {
      startTime: Date.now(),
      nodeContext,
      inputItemsCount,
    };
    
    state.nodeTimings.set(nodeName, entry);
    return entry;
  }
  
  /**
   * Complete a node and return duration
   */
  completeNode(executionId: string, nodeName: string): number {
    const state = this.executions.get(executionId);
    if (!state) return 0;
    
    const timing = state.nodeTimings.get(nodeName);
    if (!timing) return 0;
    
    const duration = Date.now() - timing.startTime;
    state.completedNodes.push(nodeName);
    
    return duration;
  }
  
  /**
   * Mark a node as failed and return duration
   */
  failNode(executionId: string, nodeName: string): number {
    const state = this.executions.get(executionId);
    if (!state) return 0;
    
    const timing = state.nodeTimings.get(nodeName);
    if (!timing) return 0;
    
    const duration = Date.now() - timing.startTime;
    state.failedNodes.push(nodeName);
    
    return duration;
  }
  
  /**
   * Get node timing info
   */
  getNodeTiming(executionId: string, nodeName: string): TimingEntry | undefined {
    const state = this.executions.get(executionId);
    if (!state) return undefined;
    
    return state.nodeTimings.get(nodeName);
  }
  
  /**
   * Complete an execution and return total duration
   */
  completeExecution(executionId: string): { duration: number; nodeCount: number } {
    const state = this.executions.get(executionId);
    if (!state) return { duration: 0, nodeCount: 0 };
    
    const duration = Date.now() - state.startTime;
    const nodeCount = state.completedNodes.length + state.failedNodes.length;
    
    return { duration, nodeCount };
  }
  
  /**
   * Clean up an execution from tracking
   */
  cleanupExecution(executionId: string): void {
    this.executions.delete(executionId);
  }
  
  /**
   * Get all active executions (for debugging)
   */
  getActiveExecutions(): string[] {
    return Array.from(this.executions.keys());
  }
  
  /**
   * Get execution summary
   */
  getExecutionSummary(executionId: string): {
    duration: number;
    nodeCount: number;
    completedNodes: string[];
    failedNodes: string[];
  } | undefined {
    const state = this.executions.get(executionId);
    if (!state) return undefined;
    
    return {
      duration: Date.now() - state.startTime,
      nodeCount: state.completedNodes.length + state.failedNodes.length,
      completedNodes: [...state.completedNodes],
      failedNodes: [...state.failedNodes],
    };
  }
}

// Singleton instance
export const executionTracker = new ExecutionTracker();
