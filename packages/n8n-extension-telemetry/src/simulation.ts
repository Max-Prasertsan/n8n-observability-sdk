/**
 * Simulation Demo
 * 
 * Demonstrates the telemetry hook functionality by simulating
 * a workflow execution without requiring n8n to be running.
 * 
 * Run with: npx ts-node src/simulation.ts
 */

import { TelemetryHook, TelemetryHookConfig } from './hook';
import { v4 as uuidv4 } from 'uuid';

// ============ Simulation Utilities ============

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDuration(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min);
}

function shouldFail(probability: number): boolean {
  return Math.random() < probability;
}

// ============ Simulated Workflow ============

interface SimulatedNode {
  name: string;
  type: string;
  minDuration: number;
  maxDuration: number;
  failProbability: number;
}

async function simulateWorkflow(
  hook: TelemetryHook,
  workflowId: string,
  workflowName: string,
  nodes: SimulatedNode[],
  sessionId?: string
): Promise<void> {
  const executionId = uuidv4();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Starting workflow: ${workflowName}`);
  console.log(`Execution ID: ${executionId}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Start workflow
  await hook.onWorkflowStart({
    executionId,
    workflowId,
    workflowName,
    mode: 'manual',
    sessionId,
    isManual: true,
    metadata: {
      simulation: true,
      started_at: new Date().toISOString(),
    },
  });
  
  let workflowFailed = false;
  let failedNode: string | undefined;
  let workflowError: Error | undefined;
  
  // Execute each node
  for (const node of nodes) {
    console.log(`  ▶ Starting node: ${node.name} (${node.type})`);
    
    // Start node
    await hook.onNodeStart({
      executionId,
      nodeName: node.name,
      nodeType: node.type,
      nodeId: uuidv4(),
      inputItemsCount: Math.floor(Math.random() * 10) + 1,
    });
    
    // Simulate node execution
    const duration = randomDuration(node.minDuration, node.maxDuration);
    await sleep(duration);
    
    // Check if node should fail
    if (shouldFail(node.failProbability)) {
      const error = new Error(`Simulated failure in ${node.name}`);
      
      await hook.onNodeFail({
        executionId,
        nodeName: node.name,
        nodeType: node.type,
        error,
      });
      
      console.log(`  ✗ Node failed: ${node.name} (${duration}ms)`);
      
      workflowFailed = true;
      failedNode = node.name;
      workflowError = error;
      break;
    } else {
      await hook.onNodeComplete({
        executionId,
        nodeName: node.name,
        nodeType: node.type,
        outputItemsCount: Math.floor(Math.random() * 5) + 1,
      });
      
      console.log(`  ✓ Node completed: ${node.name} (${duration}ms)`);
    }
  }
  
  // Complete or fail workflow
  if (workflowFailed) {
    await hook.onWorkflowFail({
      executionId,
      error: workflowError!,
      errorNode: failedNode,
    });
    
    console.log(`\n✗ Workflow failed at node: ${failedNode}`);
  } else {
    await hook.onWorkflowComplete({
      executionId,
      mode: 'manual',
    });
    
    console.log(`\n✓ Workflow completed successfully`);
  }
  
  console.log(`\n${'='.repeat(60)}\n`);
}

// ============ Main Demo ============

async function main(): Promise<void> {
  console.log('n8n Telemetry SDK - Simulation Demo');
  console.log('====================================\n');
  
  // Create hook with debug output
  const config: TelemetryHookConfig = {
    filePath: './data/events.jsonl',
    enableEvaluation: true,
    debug: false, // Set to true to see all events
    defaultMetadata: {
      demo: true,
      version: '1.0.0',
    },
  };
  
  const hook = new TelemetryHook(config);
  
  // Define simulated workflows
  const workflows = [
    {
      id: 'wf_data_pipeline',
      name: 'Data Processing Pipeline',
      sessionId: 'session_demo_001',
      nodes: [
        { name: 'Fetch Data', type: 'n8n-nodes-base.httpRequest', minDuration: 100, maxDuration: 500, failProbability: 0.1 },
        { name: 'Transform', type: 'n8n-nodes-base.code', minDuration: 50, maxDuration: 200, failProbability: 0.05 },
        { name: 'Filter Records', type: 'n8n-nodes-base.filter', minDuration: 20, maxDuration: 100, failProbability: 0.02 },
        { name: 'Send to Database', type: 'n8n-nodes-base.postgres', minDuration: 100, maxDuration: 300, failProbability: 0.1 },
        { name: 'Notify Slack', type: 'n8n-nodes-base.slack', minDuration: 50, maxDuration: 150, failProbability: 0.05 },
      ],
    },
    {
      id: 'wf_ai_workflow',
      name: 'AI Content Generation',
      sessionId: 'session_demo_002',
      nodes: [
        { name: 'Receive Webhook', type: 'n8n-nodes-base.webhook', minDuration: 10, maxDuration: 50, failProbability: 0.01 },
        { name: 'Extract Content', type: 'n8n-nodes-base.code', minDuration: 30, maxDuration: 100, failProbability: 0.05 },
        { name: 'Call OpenAI', type: 'n8n-nodes-base.openAi', minDuration: 500, maxDuration: 2000, failProbability: 0.15 },
        { name: 'Format Response', type: 'n8n-nodes-base.code', minDuration: 20, maxDuration: 80, failProbability: 0.02 },
        { name: 'Store Result', type: 'n8n-nodes-base.airtable', minDuration: 100, maxDuration: 300, failProbability: 0.08 },
        { name: 'Send Email', type: 'n8n-nodes-base.emailSend', minDuration: 100, maxDuration: 400, failProbability: 0.05 },
      ],
    },
    {
      id: 'wf_simple',
      name: 'Simple Notification',
      nodes: [
        { name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', minDuration: 5, maxDuration: 20, failProbability: 0 },
        { name: 'Set Variables', type: 'n8n-nodes-base.set', minDuration: 10, maxDuration: 30, failProbability: 0 },
        { name: 'Send Notification', type: 'n8n-nodes-base.slack', minDuration: 50, maxDuration: 200, failProbability: 0.05 },
      ],
    },
  ];
  
  // Run simulations
  for (const workflow of workflows) {
    await simulateWorkflow(
      hook,
      workflow.id,
      workflow.name,
      workflow.nodes,
      workflow.sessionId
    );
  }
  
  // Close hook to flush events
  await hook.close();
  
  console.log('\nSimulation complete!');
  console.log('Events written to: ./data/events.jsonl');
  console.log('\nTo view events, run: npm run view');
}

// Run if executed directly
main().catch(console.error);
