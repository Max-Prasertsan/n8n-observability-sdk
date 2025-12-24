# n8n Telemetry SDK

A comprehensive telemetry and evaluation SDK for n8n workflows with workflow-level and node-level lifecycle tracking.

## Overview

This SDK captures structured telemetry for:
- **Workflow lifecycle**: `workflow.started`, `workflow.completed`, `workflow.failed`
- **Node lifecycle**: `node.started`, `node.completed`, `node.failed` for every node
- **Evaluation**: Automatic scoring with metrics at workflow end

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ telemetry-core  │  │ n8n-node-       │  │ n8n-ext-    │ │
│  │ • Event Types   │  │ telemetry       │  │ telemetry   │ │
│  │ • Transport     │  │ • Config Node   │  │ • Hooks     │ │
│  │ • Evaluator     │  │ • Emit Node     │  │ • Tracker   │ │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘ │
│           └───────────────┬────┴──────────────────┘        │
│                    ┌──────▼──────┐                         │
│                    │ events.jsonl │                        │
│                    └─────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run simulation demo
cd packages/n8n-observability-sdk
npx ts-node src/simulation.ts

# View events
npm run view -- --summary
```

## Event Schema

```typescript
{
  event_id: string;       // UUID
  event_type: string;     // 'workflow.started', 'node.completed', etc.
  timestamp: string;      // ISO8601
  execution_id: string;   // n8n execution ID (primary correlation key)
  workflow_id: string;
  workflow_name?: string;
  run_id: string;         // Same as execution_id
  session_id?: string;    // Optional session correlation
  status: 'started' | 'completed' | 'failed';
  duration_ms?: number;   // For completed/failed events
  node_context?: {        // For node events
    node_id?: string;
    node_name: string;
    node_type: string;
  };
  payload?: object;       // Event-specific data
  metadata?: object;      // Custom metadata
}
```

## Packages

### @n8n-telemetry/core

Core library with event types, transport, and evaluator.

```typescript
import {
  FileTransport,
  WorkflowEvaluator,
  createWorkflowStartedEvent,
  createNodeCompletedEvent,
} from '@n8n-telemetry/core';

// Create transport
const transport = new FileTransport({ filePath: './data/events.jsonl' });

// Send event
await transport.send(event);

// Query events
const events = await transport.queryByExecution(executionId);

// Evaluate
const evaluator = new WorkflowEvaluator();
const result = evaluator.evaluate(events);
// { score: 85, labels: ['clean_execution'], reasons: [...], metrics: {...} }
```

### n8n-nodes-telemetry

Community nodes for n8n:

**Telemetry Config Node**: Configure telemetry at workflow start
- Session ID (static or from input)
- Tags, owner, environment metadata
- Transport selection (file/HTTP)
- Redaction settings
- Evaluation thresholds

**Telemetry Emit Node**: Emit custom events
- Custom events, checkpoints
- LLM request/response events
- Tool call events
- Error events

### @n8n-telemetry/extension

Extension/hook for automatic lifecycle capture:

```typescript
import { TelemetryHook } from '@n8n-telemetry/extension';

const hook = new TelemetryHook({
  filePath: './data/events.jsonl',
  enableEvaluation: true,
});

// Called automatically by n8n hooks or manually
await hook.onWorkflowStart({ executionId, workflowId, workflowName });
await hook.onNodeStart({ executionId, nodeName, nodeType });
await hook.onNodeComplete({ executionId, nodeName, nodeType });
await hook.onWorkflowComplete({ executionId });
```

## Evaluation Scoring

The evaluator produces a score (0-100) based on:

| Rule | Impact |
|------|--------|
| Workflow failed | Max score capped at 30 |
| Each failed node | -15 points |
| Workflow > 60s | -2 points per second over |
| Node > 10s | -5 points per slow node |
| Clean execution | +10 bonus |

Example evaluation output:
```json
{
  "score": 75,
  "labels": ["slow_nodes"],
  "reasons": [
    "1 node(s) exceeded time threshold (-5 points)",
    "  - Call OpenAI: 2.34s"
  ],
  "metrics": {
    "total_duration_ms": 3456,
    "node_count": 5,
    "failed_node_count": 0,
    "slowest_node": { "name": "Call OpenAI", "duration_ms": 2340 }
  }
}
```

## Integration with n8n

### Approach A: External Hooks (Recommended for full coverage)

Set environment variable:
```bash
N8N_EXTERNAL_HOOKS=/path/to/n8n-extension-telemetry/dist/n8n-external-hooks.js
TELEMETRY_FILE_PATH=./data/events.jsonl
TELEMETRY_ENABLE_EVAL=true
```

### Approach B: Community Nodes (Works with standard n8n)

1. Install the community node package
2. Add "Telemetry Config" at workflow start
3. Add "Telemetry Emit" nodes for custom checkpoints

## CLI Commands

```bash
# View all events
npm run view

# View summary
npm run view -- --summary

# Filter by execution
npm run view -- -e <execution-id>

# Timeline view
npm run view -- --timeline -e <execution-id>
```

## Sample Output

After running the simulation:

```
=== Telemetry Summary ===

Total Events: 24
Unique Executions: 3

Data Processing Pipeline
  ID: a1b2c3d4...  Status: completed  Duration: 847ms
  Score: 100/100  Labels: clean_execution

AI Content Generation
  ID: e5f6g7h8...  Status: failed  Duration: 1.23s
  Score: 15/100  Labels: workflow_failed, node_failures

Simple Notification
  ID: i9j0k1l2...  Status: completed  Duration: 156ms
  Score: 100/100  Labels: clean_execution
```

## File Structure

```
n8n-observability-sdk/
├── packages/
│   ├── telemetry-core/
│   │   └── src/
│   │       ├── events/        # Event types & factory
│   │       ├── transport/     # File, HTTP, Multi transports
│   │       └── evaluator/     # Scoring logic
│   ├── n8n-node-telemetry/
│   │   └── src/
│   │       ├── nodes/         # TelemetryConfig, TelemetryEmit
│   │       └── credentials/   # TelemetryApi credentials
│   └── n8n-extension-telemetry/
│       └── src/
│           ├── hook.ts        # TelemetryHook class
│           ├── tracker.ts     # Execution timing tracker
│           ├── n8n-external-hooks.ts
│           └── simulation.ts  # Demo simulation
├── scripts/
│   └── view-events.js         # CLI viewer
├── examples/
│   └── demo-workflow.json     # Example n8n workflow
└── data/
    └── events.jsonl           # Telemetry output
```

## License
This is for demo purpose only to demonstrate the capability of hooking up one custom SDK to n8n.