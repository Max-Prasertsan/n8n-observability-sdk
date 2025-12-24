import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  IDataObject,
} from 'n8n-workflow';
import { v4 as uuidv4 } from 'uuid';

export class TelemetryConfig implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Telemetry Config',
    name: 'telemetryConfig',
    icon: 'file:telemetry.svg',
    group: ['transform'],
    version: 1,
    subtitle: 'Configure telemetry for this workflow',
    description: 'Configure telemetry settings including session ID, tags, and transport options',
    defaults: {
      name: 'Telemetry Config',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'telemetryApi',
        required: false,
      },
    ],
    properties: [
      // ============ Session Configuration ============
      {
        displayName: 'Session ID',
        name: 'sessionId',
        type: 'string',
        default: '',
        placeholder: 'Leave empty to auto-generate',
        description: 'Session ID to correlate related workflow executions. Leave empty to auto-generate.',
      },
      {
        displayName: 'Session ID From Input',
        name: 'sessionIdFromInput',
        type: 'boolean',
        default: false,
        description: 'Whether to take session ID from input data',
      },
      {
        displayName: 'Session ID Field',
        name: 'sessionIdField',
        type: 'string',
        default: 'session_id',
        displayOptions: {
          show: {
            sessionIdFromInput: [true],
          },
        },
        description: 'The field name in input data containing the session ID',
      },
      
      // ============ Metadata ============
      {
        displayName: 'Tags',
        name: 'tags',
        type: 'string',
        default: '',
        placeholder: 'production, api, customer-facing',
        description: 'Comma-separated tags for this workflow execution',
      },
      {
        displayName: 'Owner',
        name: 'owner',
        type: 'string',
        default: '',
        placeholder: 'team-name or user@example.com',
        description: 'Owner identifier for this workflow',
      },
      {
        displayName: 'Environment',
        name: 'environment',
        type: 'options',
        options: [
          { name: 'Development', value: 'development' },
          { name: 'Staging', value: 'staging' },
          { name: 'Production', value: 'production' },
        ],
        default: 'development',
        description: 'Environment this workflow is running in',
      },
      {
        displayName: 'Custom Metadata',
        name: 'customMetadata',
        type: 'fixedCollection',
        typeOptions: {
          multipleValues: true,
        },
        default: {},
        options: [
          {
            name: 'metadata',
            displayName: 'Metadata',
            values: [
              {
                displayName: 'Key',
                name: 'key',
                type: 'string',
                default: '',
              },
              {
                displayName: 'Value',
                name: 'value',
                type: 'string',
                default: '',
              },
            ],
          },
        ],
        description: 'Custom key-value pairs to include in telemetry',
      },
      
      // ============ Transport Configuration ============
      {
        displayName: 'Transport',
        name: 'transport',
        type: 'options',
        options: [
          { name: 'File (JSONL)', value: 'file' },
          { name: 'HTTP', value: 'http' },
          { name: 'Both', value: 'both' },
        ],
        default: 'file',
        description: 'Where to send telemetry events',
      },
      {
        displayName: 'File Path',
        name: 'filePath',
        type: 'string',
        default: './data/events.jsonl',
        displayOptions: {
          show: {
            transport: ['file', 'both'],
          },
        },
        description: 'Path to the JSONL file',
      },
      {
        displayName: 'HTTP Endpoint',
        name: 'httpEndpoint',
        type: 'string',
        default: 'http://localhost:3001/events',
        displayOptions: {
          show: {
            transport: ['http', 'both'],
          },
        },
        description: 'HTTP endpoint to send events to',
      },
      
      // ============ Redaction Settings ============
      {
        displayName: 'Redact Payloads',
        name: 'redactPayloads',
        type: 'boolean',
        default: true,
        description: 'Whether to redact sensitive fields from event payloads',
      },
      {
        displayName: 'Additional Redact Fields',
        name: 'redactFields',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            redactPayloads: [true],
          },
        },
        placeholder: 'ssn, credit_card, custom_secret',
        description: 'Comma-separated list of additional field names to redact',
      },
      {
        displayName: 'Capture Payloads',
        name: 'capturePayloads',
        type: 'boolean',
        default: true,
        description: 'Whether to capture node input/output data in telemetry. Disable for minimal telemetry (only timings and node names).',
      },
      
      // ============ Evaluation Settings ============
      {
        displayName: 'Enable Evaluation',
        name: 'enableEvaluation',
        type: 'boolean',
        default: true,
        description: 'Whether to run evaluation at workflow end',
      },
      {
        displayName: 'Evaluation Thresholds',
        name: 'evalThresholds',
        type: 'fixedCollection',
        typeOptions: {
          multipleValues: false,
        },
        default: {},
        displayOptions: {
          show: {
            enableEvaluation: [true],
          },
        },
        options: [
          {
            name: 'thresholds',
            displayName: 'Thresholds',
            values: [
              {
                displayName: 'Max Workflow Duration (ms)',
                name: 'maxWorkflowDurationMs',
                type: 'number',
                default: 60000,
                description: 'Maximum acceptable workflow duration before penalty',
              },
              {
                displayName: 'Max Node Duration (ms)',
                name: 'maxNodeDurationMs',
                type: 'number',
                default: 10000,
                description: 'Maximum acceptable node duration before penalty',
              },
              {
                displayName: 'Failed Node Penalty',
                name: 'failedNodePenalty',
                type: 'number',
                default: 15,
                description: 'Points deducted per failed node',
              },
            ],
          },
        ],
        description: 'Thresholds for workflow evaluation scoring',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    // Get workflow info
    const workflowId = this.getWorkflow().id?.toString() || 'unknown';
    const workflowName = this.getWorkflow().name || 'Unknown Workflow';
    
    // Get execution info
    const executionId = this.getExecutionId() || uuidv4();

    for (let i = 0; i < items.length; i++) {
      // Get session ID
      let sessionId = this.getNodeParameter('sessionId', i, '') as string;
      const sessionIdFromInput = this.getNodeParameter('sessionIdFromInput', i) as boolean;
      
      if (sessionIdFromInput) {
        const sessionIdField = this.getNodeParameter('sessionIdField', i) as string;
        const inputData = items[i].json;
        sessionId = (inputData[sessionIdField] as string) || sessionId;
      }
      
      if (!sessionId) {
        sessionId = uuidv4();
      }

      // Get metadata
      const tags = (this.getNodeParameter('tags', i, '') as string)
        .split(',')
        .map(t => t.trim())
        .filter(t => t);
      const owner = this.getNodeParameter('owner', i, '') as string;
      const environment = this.getNodeParameter('environment', i) as string;
      
      const customMetadataRaw = this.getNodeParameter('customMetadata', i, {}) as IDataObject;
      const customMetadata: Record<string, string> = {};
      
      if (customMetadataRaw.metadata) {
        const metadataItems = customMetadataRaw.metadata as Array<{ key: string; value: string }>;
        for (const item of metadataItems) {
          if (item.key) {
            customMetadata[item.key] = item.value;
          }
        }
      }

      // Get transport config
      const transport = this.getNodeParameter('transport', i) as string;
      const filePath = this.getNodeParameter('filePath', i, './data/events.jsonl') as string;
      const httpEndpoint = this.getNodeParameter('httpEndpoint', i, '') as string;

      // Get redaction config
      const redactPayloads = this.getNodeParameter('redactPayloads', i) as boolean;
      const redactFieldsRaw = this.getNodeParameter('redactFields', i, '') as string;
      const redactFields = redactFieldsRaw
        .split(',')
        .map(f => f.trim())
        .filter(f => f);
      const capturePayloads = this.getNodeParameter('capturePayloads', i) as boolean;

      // Get evaluation config
      const enableEvaluation = this.getNodeParameter('enableEvaluation', i) as boolean;
      const evalThresholdsRaw = this.getNodeParameter('evalThresholds', i, {}) as IDataObject;
      
      let evalThresholds = {};
      if (evalThresholdsRaw.thresholds) {
        evalThresholds = evalThresholdsRaw.thresholds as Record<string, number>;
      }

      // Build telemetry config object
      const telemetryConfig = {
        // Identifiers
        session_id: sessionId,
        execution_id: executionId,
        workflow_id: workflowId,
        workflow_name: workflowName,
        
        // Metadata
        tags,
        owner,
        environment,
        custom_metadata: customMetadata,
        
        // Transport
        transport: {
          type: transport,
          file_path: filePath,
          http_endpoint: httpEndpoint,
        },
        
        // Redaction
        redaction: {
          enabled: redactPayloads,
          fields: redactFields,
          capture_payloads: capturePayloads,
        },
        
        // Evaluation
        evaluation: {
          enabled: enableEvaluation,
          thresholds: evalThresholds,
        },
        
        // Timestamp
        configured_at: new Date().toISOString(),
      };

      // Pass through input data with telemetry config attached
      returnData.push({
        json: {
          ...items[i].json,
          _telemetry_config: telemetryConfig,
        },
        pairedItem: { item: i },
      });
    }

    return [returnData];
  }
}
