/**
 * Standalone Telemetry Runner
 * 
 * This module allows testing the telemetry system without n8n.
 * It can also be used to manually instrument code.
 */

import { TelemetryHook, getTelemetryHook, TelemetryHookConfig } from './hook';

export interface WorkflowSimulation {
  workflowId: string;
  workflowName: string;
  nodes: NodeSimulation[];
  sessionId?: string;
}

export interface NodeSimulation {
  name: string;
  type: string;
  durationMs?: number;
  shouldFail?: boolean;
  errorMessage?: string;
  inputItems?: number;
  outputItems?: number;
}

/**
 * Simulate a workflow execution for testing
 */
export async function simulateWorkflow(
  simulation: WorkflowSimulation,
  config?: Partial<TelemetryHookConfig>
): Promise<string> {
  const hook = getTelemetryHook(config);
  const executionId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Start workflow
  await hook.onWorkflowStart({
    executionId,
    workflowId: simulation.workflowId,
    workflowName: simulation.workflowName,
    mode: 'simulation',
    isManual: true,
    sessionId: simulation.sessionId,
  });
  
  let workflowError: Error | null = null;
  let errorNode: string | null = null;
  
  // Execute each node
  for (let i = 0; i < simulation.nodes.length; i++) {
    const node = simulation.nodes[i];
    
    // Start node
    await hook.onNodeStart({
      executionId,
      workflowId: simulation.workflowId,
      workflowName: simulation.workflowName,
      nodeName: node.name,
      nodeType: node.type,
      nodeIndex: i,
      inputItemsCount: node.inputItems,
    });
    
    // Simulate execution time
    if (node.durationMs) {
      await new Promise(resolve => setTimeout(resolve, node.durationMs));
    }
    
    if (node.shouldFail) {
      const error = new Error(node.errorMessage || 'Node execution failed');
      
      await hook.onNodeError({
        executionId,
        workflowId: simulation.workflowId,
        workflowName: simulation.workflowName,
        nodeName: node.name,
        nodeType: node.type,
        nodeIndex: i,
        error,
      });
      
      workflowError = error;
      errorNode = node.name;
      break;
    } else {
      await hook.onNodeComplete({
        executionId,
        workflowId: simulation.workflowId,
        workflowName: simulation.workflowName,
        nodeName: node.name,
        nodeType: node.type,
        nodeIndex: i,
        outputItemsCount: node.outputItems,
      });
    }
  }
  
  // End workflow
  if (workflowError) {
    await hook.onWorkflowError({
      executionId,
      workflowId: simulation.workflowId,
      workflowName: simulation.workflowName,
      error: workflowError,
      errorNode: errorNode || undefined,
    });
  } else {
    await hook.onWorkflowComplete({
      executionId,
      workflowId: simulation.workflowId,
      workflowName: simulation.workflowName,
      nodeCount: simulation.nodes.length,
      mode: 'simulation',
    });
  }
  
  return executionId;
}

/**
 * Demo simulation showing various scenarios
 */
export async function runDemoSimulation(config?: Partial<TelemetryHookConfig>): Promise<void> {
  console.log('\n🚀 Running demo simulations...\n');
  
  // Simulation 1: Successful workflow
  console.log('📋 Simulation 1: Successful 4-node workflow');
  const exec1 = await simulateWorkflow({
    workflowId: 'demo_1',
    workflowName: 'Data Processing Pipeline',
    sessionId: 'demo_session_001',
    nodes: [
      { name: 'HTTP Request', type: 'n8n-nodes-base.httpRequest', durationMs: 150, inputItems: 1, outputItems: 10 },
      { name: 'Transform Data', type: 'n8n-nodes-base.function', durationMs: 50, inputItems: 10, outputItems: 10 },
      { name: 'Filter Records', type: 'n8n-nodes-base.filter', durationMs: 20, inputItems: 10, outputItems: 5 },
      { name: 'Save to Database', type: 'n8n-nodes-base.postgres', durationMs: 100, inputItems: 5, outputItems: 5 },
    ],
  }, config);
  console.log(`   ✅ Completed: ${exec1}\n`);
  
  // Simulation 2: Workflow with node failure
  console.log('📋 Simulation 2: Workflow with node failure');
  const exec2 = await simulateWorkflow({
    workflowId: 'demo_2',
    workflowName: 'API Integration',
    sessionId: 'demo_session_002',
    nodes: [
      { name: 'Start', type: 'n8n-nodes-base.start', durationMs: 10, outputItems: 1 },
      { name: 'Fetch API Data', type: 'n8n-nodes-base.httpRequest', durationMs: 200, inputItems: 1, outputItems: 5 },
      { name: 'Process Response', type: 'n8n-nodes-base.function', durationMs: 30, shouldFail: true, errorMessage: 'Invalid JSON response' },
      { name: 'Send Notification', type: 'n8n-nodes-base.slack', durationMs: 50 },
    ],
  }, config);
  console.log(`   ❌ Failed: ${exec2}\n`);
  
  // Simulation 3: Slow workflow
  console.log('📋 Simulation 3: Slow workflow (triggers evaluation penalties)');
  const exec3 = await simulateWorkflow({
    workflowId: 'demo_3',
    workflowName: 'Heavy Data Export',
    sessionId: 'demo_session_003',
    nodes: [
      { name: 'Load Data', type: 'n8n-nodes-base.spreadsheet', durationMs: 5000, outputItems: 1000 },
      { name: 'Transform', type: 'n8n-nodes-base.function', durationMs: 15000, inputItems: 1000, outputItems: 1000 },
      { name: 'Export', type: 'n8n-nodes-base.writeBinaryFile', durationMs: 3000, inputItems: 1000, outputItems: 1 },
    ],
  }, config);
  console.log(`   ⚠️ Completed (slow): ${exec3}\n`);
  
  console.log('✨ All simulations complete!\n');
  console.log(`📁 Check the events file at: ${config?.filePath || './data/events.jsonl'}\n`);
}
