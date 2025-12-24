/**
 * n8n External Hooks Integration
 * 
 * This file implements the external hooks interface for n8n.
 * To use, set the N8N_EXTERNAL_HOOKS environment variable to point to this file.
 * 
 * Example:
 *   N8N_EXTERNAL_HOOKS=/path/to/n8n-telemetry-sdk/packages/n8n-extension-telemetry/dist/external-hooks.js
 * 
 * n8n supports the following hook points:
 * - workflow.preExecute
 * - workflow.postExecute
 * - node.preExecute
 * - node.postExecute
 * 
 * Note: The exact hook interface may vary between n8n versions.
 * This implementation attempts to be compatible with multiple versions.
 */

import { TelemetryHook, getTelemetryHook, TelemetryHookConfig } from './hook';

// ============ Configuration from Environment ============

function getConfigFromEnv(): Partial<TelemetryHookConfig> {
  return {
    enabled: process.env.TELEMETRY_ENABLED !== 'false',
    filePath: process.env.TELEMETRY_FILE_PATH || './data/events.jsonl',
    httpEndpoint: process.env.TELEMETRY_HTTP_ENDPOINT,
    capturePayloads: process.env.TELEMETRY_CAPTURE_PAYLOADS !== 'false',
    enableEvaluation: process.env.TELEMETRY_ENABLE_EVALUATION !== 'false',
  };
}

// ============ Hook Instance ============

const hook = getTelemetryHook(getConfigFromEnv());

// ============ n8n External Hooks Interface ============

/**
 * External hooks object that n8n will load
 */
export const externalHooks = {
  /**
   * Called before a workflow starts executing
   */
  'workflow.preExecute': [
    async function (this: unknown, workflowData: unknown, runData: unknown): Promise<void> {
      try {
        const workflow = workflowData as {
          id?: string | number;
          name?: string;
        };
        
        const execution = runData as {
          executionId?: string;
          mode?: string;
          retryOf?: string;
        };
        
        await hook.onWorkflowStart({
          executionId: execution?.executionId || `exec_${Date.now()}`,
          workflowId: String(workflow?.id || 'unknown'),
          workflowName: workflow?.name || 'Unknown Workflow',
          mode: execution?.mode,
          isManual: execution?.mode === 'manual',
          retryOf: execution?.retryOf,
        });
      } catch (error) {
        console.error('[Telemetry] Error in workflow.preExecute hook:', error);
      }
    },
  ],
  
  /**
   * Called after a workflow finishes executing (success or failure)
   */
  'workflow.postExecute': [
    async function (
      this: unknown,
      runData: unknown,
      workflowData: unknown,
      executionData: unknown
    ): Promise<void> {
      try {
        const workflow = workflowData as {
          id?: string | number;
          name?: string;
          nodes?: unknown[];
        };
        
        const execution = runData as {
          executionId?: string;
          mode?: string;
          finished?: boolean;
          stoppedAt?: string;
        };
        
        const execData = executionData as {
          resultData?: {
            error?: Error;
            runData?: Record<string, unknown[]>;
          };
          executionData?: {
            nodeExecutionStack?: unknown[];
          };
        };
        
        const error = execData?.resultData?.error;
        const nodeCount = workflow?.nodes?.length || 0;
        
        if (error) {
          await hook.onWorkflowError({
            executionId: execution?.executionId || `exec_${Date.now()}`,
            workflowId: String(workflow?.id || 'unknown'),
            workflowName: workflow?.name || 'Unknown Workflow',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        } else {
          await hook.onWorkflowComplete({
            executionId: execution?.executionId || `exec_${Date.now()}`,
            workflowId: String(workflow?.id || 'unknown'),
            workflowName: workflow?.name || 'Unknown Workflow',
            nodeCount,
            mode: execution?.mode,
          });
        }
      } catch (error) {
        console.error('[Telemetry] Error in workflow.postExecute hook:', error);
      }
    },
  ],
  
  /**
   * Called before each node executes
   */
  'node.preExecute': [
    async function (
      this: unknown,
      nodeName: string,
      nodeType: string,
      workflowData: unknown,
      runData: unknown,
      nodeIndex?: number
    ): Promise<void> {
      try {
        const workflow = workflowData as {
          id?: string | number;
          name?: string;
        };
        
        const execution = runData as {
          executionId?: string;
        };
        
        await hook.onNodeStart({
          executionId: execution?.executionId || `exec_${Date.now()}`,
          workflowId: String(workflow?.id || 'unknown'),
          workflowName: workflow?.name || 'Unknown Workflow',
          nodeName,
          nodeType,
          nodeIndex,
        });
      } catch (error) {
        console.error('[Telemetry] Error in node.preExecute hook:', error);
      }
    },
  ],
  
  /**
   * Called after each node finishes executing
   */
  'node.postExecute': [
    async function (
      this: unknown,
      nodeName: string,
      nodeType: string,
      workflowData: unknown,
      runData: unknown,
      nodeIndex?: number,
      nodeOutput?: unknown,
      nodeError?: Error
    ): Promise<void> {
      try {
        const workflow = workflowData as {
          id?: string | number;
          name?: string;
        };
        
        const execution = runData as {
          executionId?: string;
        };
        
        const executionId = execution?.executionId || `exec_${Date.now()}`;
        const workflowId = String(workflow?.id || 'unknown');
        const workflowName = workflow?.name || 'Unknown Workflow';
        
        if (nodeError) {
          await hook.onNodeError({
            executionId,
            workflowId,
            workflowName,
            nodeName,
            nodeType,
            nodeIndex,
            error: nodeError instanceof Error ? nodeError : new Error(String(nodeError)),
          });
        } else {
          // Try to count output items
          let outputItemsCount: number | undefined;
          if (Array.isArray(nodeOutput)) {
            outputItemsCount = nodeOutput.flat().length;
          }
          
          await hook.onNodeComplete({
            executionId,
            workflowId,
            workflowName,
            nodeName,
            nodeType,
            nodeIndex,
            outputItemsCount,
          });
        }
      } catch (error) {
        console.error('[Telemetry] Error in node.postExecute hook:', error);
      }
    },
  ],
};

// ============ Alternative Integration: Event Listener ============

/**
 * For n8n versions that use EventEmitter for execution events,
 * this function can be called to attach listeners.
 * 
 * Usage in n8n startup script or custom integration:
 * 
 *   const { attachToEventEmitter } = require('@n8n-telemetry/extension');
 *   attachToEventEmitter(n8nEventEmitter);
 */
export function attachToEventEmitter(eventEmitter: {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
}): void {
  // Workflow events
  eventEmitter.on('workflowExecuteStart', (data: {
    executionId: string;
    workflowId: string;
    workflowName: string;
    mode?: string;
  }) => {
    hook.onWorkflowStart({
      executionId: data.executionId,
      workflowId: data.workflowId,
      workflowName: data.workflowName,
      mode: data.mode,
    }).catch(console.error);
  });
  
  eventEmitter.on('workflowExecuteComplete', (data: {
    executionId: string;
    workflowId: string;
    workflowName: string;
    nodeCount?: number;
  }) => {
    hook.onWorkflowComplete({
      executionId: data.executionId,
      workflowId: data.workflowId,
      workflowName: data.workflowName,
      nodeCount: data.nodeCount,
    }).catch(console.error);
  });
  
  eventEmitter.on('workflowExecuteError', (data: {
    executionId: string;
    workflowId: string;
    workflowName: string;
    error: Error;
    errorNode?: string;
  }) => {
    hook.onWorkflowError({
      executionId: data.executionId,
      workflowId: data.workflowId,
      workflowName: data.workflowName,
      error: data.error,
      errorNode: data.errorNode,
    }).catch(console.error);
  });
  
  // Node events
  eventEmitter.on('nodeExecuteStart', (data: {
    executionId: string;
    workflowId: string;
    workflowName: string;
    nodeName: string;
    nodeType: string;
    nodeIndex?: number;
  }) => {
    hook.onNodeStart({
      executionId: data.executionId,
      workflowId: data.workflowId,
      workflowName: data.workflowName,
      nodeName: data.nodeName,
      nodeType: data.nodeType,
      nodeIndex: data.nodeIndex,
    }).catch(console.error);
  });
  
  eventEmitter.on('nodeExecuteComplete', (data: {
    executionId: string;
    workflowId: string;
    workflowName: string;
    nodeName: string;
    nodeType: string;
    nodeIndex?: number;
    outputItemsCount?: number;
  }) => {
    hook.onNodeComplete({
      executionId: data.executionId,
      workflowId: data.workflowId,
      workflowName: data.workflowName,
      nodeName: data.nodeName,
      nodeType: data.nodeType,
      nodeIndex: data.nodeIndex,
      outputItemsCount: data.outputItemsCount,
    }).catch(console.error);
  });
  
  eventEmitter.on('nodeExecuteError', (data: {
    executionId: string;
    workflowId: string;
    workflowName: string;
    nodeName: string;
    nodeType: string;
    nodeIndex?: number;
    error: Error;
  }) => {
    hook.onNodeError({
      executionId: data.executionId,
      workflowId: data.workflowId,
      workflowName: data.workflowName,
      nodeName: data.nodeName,
      nodeType: data.nodeType,
      nodeIndex: data.nodeIndex,
      error: data.error,
    }).catch(console.error);
  });
  
  console.log('[Telemetry] Attached to n8n event emitter');
}

// Export default for CommonJS compatibility
export default externalHooks;
