/**
 * n8n External Hooks Integration
 * 
 * This file provides the integration layer between the TelemetryHook
 * and n8n's external hooks system.
 * 
 * To use this with n8n, you need to:
 * 
 * 1. Set the N8N_EXTERNAL_HOOKS environment variable to point to this file
 *    Example: N8N_EXTERNAL_HOOKS=/path/to/n8n-external-hooks.js
 * 
 * 2. Configure the telemetry settings via environment variables:
 *    - TELEMETRY_FILE_PATH: Path to JSONL file (default: ./data/events.jsonl)
 *    - TELEMETRY_HTTP_ENDPOINT: HTTP endpoint for events (optional)
 *    - TELEMETRY_ENABLE_EVAL: Enable evaluation (default: true)
 *    - TELEMETRY_DEBUG: Enable debug logging (default: false)
 * 
 * Note: This requires n8n to support external hooks, which may require
 * enterprise features or a custom build.
 */

import { TelemetryHook, TelemetryHookConfig } from './hook';

// ============ Configuration from Environment ============

function getConfig(): TelemetryHookConfig {
  return {
    filePath: process.env.TELEMETRY_FILE_PATH || './data/events.jsonl',
    httpEndpoint: process.env.TELEMETRY_HTTP_ENDPOINT,
    enableEvaluation: process.env.TELEMETRY_ENABLE_EVAL !== 'false',
    debug: process.env.TELEMETRY_DEBUG === 'true',
    redactPayloads: process.env.TELEMETRY_REDACT_PAYLOADS !== 'false',
    defaultMetadata: {
      environment: process.env.NODE_ENV || 'development',
      n8n_version: process.env.N8N_VERSION,
    },
  };
}

// ============ Singleton Hook Instance ============

let hook: TelemetryHook | null = null;

function getHook(): TelemetryHook {
  if (!hook) {
    hook = new TelemetryHook(getConfig());
  }
  return hook;
}

// ============ n8n External Hooks Interface ============

/**
 * The external hooks object that n8n will import.
 * 
 * n8n calls these hooks at various points in the execution lifecycle.
 * The exact hook names and signatures depend on your n8n version.
 */
export const externalHooks = {
  /**
   * Called before a workflow execution starts
   */
  'workflow.preExecute': [
    async function(
      this: unknown,
      workflowData: { id?: string; name?: string },
      executionData: { 
        executionId: string; 
        mode: string;
        retryOf?: string;
      }
    ): Promise<void> {
      try {
        await getHook().onWorkflowStart({
          executionId: executionData.executionId,
          workflowId: workflowData.id || 'unknown',
          workflowName: workflowData.name || 'Unknown Workflow',
          mode: executionData.mode,
          isManual: executionData.mode === 'manual',
          retryOf: executionData.retryOf,
        });
      } catch (error) {
        console.error('[Telemetry] Error in workflow.preExecute hook:', error);
      }
    },
  ],
  
  /**
   * Called after a workflow execution completes (success or failure)
   */
  'workflow.postExecute': [
    async function(
      this: unknown,
      workflowData: { id?: string; name?: string },
      executionData: {
        executionId: string;
        mode: string;
        status: string;
        error?: Error;
        stoppedAt?: string;
      }
    ): Promise<void> {
      try {
        if (executionData.status === 'success') {
          await getHook().onWorkflowComplete({
            executionId: executionData.executionId,
            mode: executionData.mode,
          });
        } else if (executionData.status === 'error' || executionData.status === 'failed') {
          await getHook().onWorkflowFail({
            executionId: executionData.executionId,
            error: executionData.error || new Error('Workflow failed'),
          });
        }
      } catch (error) {
        console.error('[Telemetry] Error in workflow.postExecute hook:', error);
      }
    },
  ],
  
  /**
   * Called before a node executes
   * Note: This hook may not be available in all n8n versions
   */
  'node.preExecute': [
    async function(
      this: unknown,
      nodeName: string,
      nodeType: string,
      executionData: {
        executionId: string;
        node: { id?: string };
        inputData?: { main?: Array<Array<{ json: unknown }>> };
      }
    ): Promise<void> {
      try {
        const inputItemsCount = executionData.inputData?.main?.[0]?.length || 0;
        
        await getHook().onNodeStart({
          executionId: executionData.executionId,
          nodeName,
          nodeType,
          nodeId: executionData.node?.id,
          inputItemsCount,
        });
      } catch (error) {
        console.error('[Telemetry] Error in node.preExecute hook:', error);
      }
    },
  ],
  
  /**
   * Called after a node executes
   * Note: This hook may not be available in all n8n versions
   */
  'node.postExecute': [
    async function(
      this: unknown,
      nodeName: string,
      nodeType: string,
      executionData: {
        executionId: string;
        node: { id?: string };
        outputData?: { main?: Array<Array<{ json: unknown }>> };
        error?: Error;
      }
    ): Promise<void> {
      try {
        if (executionData.error) {
          await getHook().onNodeFail({
            executionId: executionData.executionId,
            nodeName,
            nodeType,
            nodeId: executionData.node?.id,
            error: executionData.error,
          });
        } else {
          const outputItemsCount = executionData.outputData?.main?.[0]?.length || 0;
          
          await getHook().onNodeComplete({
            executionId: executionData.executionId,
            nodeName,
            nodeType,
            nodeId: executionData.node?.id,
            outputItemsCount,
          });
        }
      } catch (error) {
        console.error('[Telemetry] Error in node.postExecute hook:', error);
      }
    },
  ],
};

// ============ Graceful Shutdown ============

async function shutdown(): Promise<void> {
  if (hook) {
    await hook.close();
    hook = null;
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Export for use
export default externalHooks;
