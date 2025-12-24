import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  IDataObject,
} from 'n8n-workflow';
import { v4 as uuidv4 } from 'uuid';
import {
  FileTransport,
  HttpTransport,
  MultiTransport,
  Transport,
  createCustomEvent,
  createLLMRequestedEvent,
  createLLMRespondedEvent,
  ExecutionContext,
  NodeContext,
} from '@n8n-telemetry/core';

export class TelemetryEmit implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Telemetry Emit',
    name: 'telemetryEmit',
    icon: 'file:telemetry.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["eventType"]}}',
    description: 'Emit custom telemetry events at specific points in your workflow',
    defaults: {
      name: 'Telemetry Emit',
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
      // ============ Event Type ============
      {
        displayName: 'Event Type',
        name: 'eventType',
        type: 'options',
        options: [
          { name: 'Custom Event', value: 'custom' },
          { name: 'LLM Request', value: 'llm.requested' },
          { name: 'LLM Response', value: 'llm.responded' },
          { name: 'Tool Called', value: 'tool.called' },
          { name: 'Tool Responded', value: 'tool.responded' },
          { name: 'Checkpoint', value: 'checkpoint' },
          { name: 'Error', value: 'error' },
        ],
        default: 'custom',
        description: 'The type of event to emit',
      },
      
      // ============ Custom Event Fields ============
      {
        displayName: 'Event Name',
        name: 'eventName',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            eventType: ['custom', 'checkpoint', 'error'],
          },
        },
        placeholder: 'user_authenticated',
        description: 'Name of the custom event',
      },
      {
        displayName: 'Event Data',
        name: 'eventData',
        type: 'fixedCollection',
        typeOptions: {
          multipleValues: true,
        },
        default: {},
        displayOptions: {
          show: {
            eventType: ['custom', 'checkpoint'],
          },
        },
        options: [
          {
            name: 'data',
            displayName: 'Data',
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
        description: 'Custom data to include in the event',
      },
      
      // ============ LLM Event Fields ============
      {
        displayName: 'Provider',
        name: 'llmProvider',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            eventType: ['llm.requested', 'llm.responded'],
          },
        },
        placeholder: 'openai',
        description: 'LLM provider name',
      },
      {
        displayName: 'Model',
        name: 'llmModel',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            eventType: ['llm.requested', 'llm.responded'],
          },
        },
        placeholder: 'gpt-4',
        description: 'Model name',
      },
      {
        displayName: 'Prompt Tokens',
        name: 'promptTokens',
        type: 'number',
        default: 0,
        displayOptions: {
          show: {
            eventType: ['llm.requested'],
          },
        },
        description: 'Number of prompt tokens',
      },
      {
        displayName: 'Completion Tokens',
        name: 'completionTokens',
        type: 'number',
        default: 0,
        displayOptions: {
          show: {
            eventType: ['llm.responded'],
          },
        },
        description: 'Number of completion tokens',
      },
      {
        displayName: 'Total Tokens',
        name: 'totalTokens',
        type: 'number',
        default: 0,
        displayOptions: {
          show: {
            eventType: ['llm.responded'],
          },
        },
        description: 'Total tokens used',
      },
      {
        displayName: 'Duration (ms)',
        name: 'durationMs',
        type: 'number',
        default: 0,
        displayOptions: {
          show: {
            eventType: ['llm.responded', 'tool.responded'],
          },
        },
        description: 'Duration of the operation in milliseconds',
      },
      
      // ============ Tool Event Fields ============
      {
        displayName: 'Tool Name',
        name: 'toolName',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            eventType: ['tool.called', 'tool.responded'],
          },
        },
        placeholder: 'search_database',
        description: 'Name of the tool',
      },
      
      // ============ Error Fields ============
      {
        displayName: 'Error Message',
        name: 'errorMessage',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            eventType: ['error'],
          },
        },
        placeholder: 'Something went wrong',
        description: 'Error message',
      },
      {
        displayName: 'Error Type',
        name: 'errorType',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            eventType: ['error'],
          },
        },
        placeholder: 'ValidationError',
        description: 'Type or class of error',
      },
      
      // ============ Transport Override ============
      {
        displayName: 'Use Config From Input',
        name: 'useConfigFromInput',
        type: 'boolean',
        default: true,
        description: 'Whether to use telemetry config from previous Telemetry Config node',
      },
      {
        displayName: 'File Path',
        name: 'filePath',
        type: 'string',
        default: './data/events.jsonl',
        displayOptions: {
          show: {
            useConfigFromInput: [false],
          },
        },
        description: 'Path to the JSONL file',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    // Get current node info for context
    const nodeName = this.getNode().name;
    const nodeType = this.getNode().type;
    const workflowId = this.getWorkflow().id?.toString() || 'unknown';
    const workflowName = this.getWorkflow().name || 'Unknown Workflow';
    const executionId = this.getExecutionId() || uuidv4();

    for (let i = 0; i < items.length; i++) {
      const eventType = this.getNodeParameter('eventType', i) as string;
      const useConfigFromInput = this.getNodeParameter('useConfigFromInput', i) as boolean;
      
      // Get telemetry config
      let filePath = './data/events.jsonl';
      let sessionId: string | null = null;
      let metadata: Record<string, unknown> = {};
      
      if (useConfigFromInput && items[i].json._telemetry_config) {
        const config = items[i].json._telemetry_config as IDataObject;
        filePath = (config.transport as IDataObject)?.file_path as string || filePath;
        sessionId = config.session_id as string || null;
        metadata = {
          tags: config.tags,
          owner: config.owner,
          environment: config.environment,
          ...((config.custom_metadata as Record<string, unknown>) || {}),
        };
      } else {
        filePath = this.getNodeParameter('filePath', i) as string;
      }

      // Create transport
      const transport: Transport = new FileTransport({
        filePath,
        createDir: true,
      });

      // Build execution context
      const context: ExecutionContext = {
        execution_id: executionId,
        workflow_id: workflowId,
        workflow_name: workflowName,
        session_id: sessionId,
        metadata,
      };

      // Build node context
      const nodeContext: NodeContext = {
        node_name: nodeName,
        node_type: nodeType,
      };

      try {
        // Create and send event based on type
        let event;

        switch (eventType) {
          case 'custom':
          case 'checkpoint': {
            const eventName = this.getNodeParameter('eventName', i) as string;
            const eventDataRaw = this.getNodeParameter('eventData', i, {}) as IDataObject;
            
            const eventData: Record<string, unknown> = {};
            if (eventDataRaw.data) {
              const dataItems = eventDataRaw.data as Array<{ key: string; value: string }>;
              for (const item of dataItems) {
                if (item.key) {
                  eventData[item.key] = item.value;
                }
              }
            }
            
            event = createCustomEvent(context, eventName, eventData, nodeContext);
            if (eventType === 'checkpoint') {
              event.event_type = 'checkpoint';
            }
            break;
          }

          case 'llm.requested': {
            const provider = this.getNodeParameter('llmProvider', i) as string;
            const model = this.getNodeParameter('llmModel', i) as string;
            const promptTokens = this.getNodeParameter('promptTokens', i) as number;
            
            event = createLLMRequestedEvent(context, nodeContext, {
              provider,
              model,
              prompt_tokens: promptTokens,
            });
            break;
          }

          case 'llm.responded': {
            const provider = this.getNodeParameter('llmProvider', i) as string;
            const model = this.getNodeParameter('llmModel', i) as string;
            const completionTokens = this.getNodeParameter('completionTokens', i) as number;
            const totalTokens = this.getNodeParameter('totalTokens', i) as number;
            const durationMs = this.getNodeParameter('durationMs', i) as number;
            
            event = createLLMRespondedEvent(context, nodeContext, durationMs, {
              provider,
              model,
              completion_tokens: completionTokens,
              total_tokens: totalTokens,
            });
            break;
          }

          case 'tool.called':
          case 'tool.responded': {
            const toolName = this.getNodeParameter('toolName', i) as string;
            const durationMs = eventType === 'tool.responded' 
              ? this.getNodeParameter('durationMs', i) as number 
              : undefined;
            
            event = createCustomEvent(context, toolName, { 
              tool_name: toolName,
              duration_ms: durationMs,
            }, nodeContext);
            event.event_type = eventType;
            break;
          }

          case 'error': {
            const eventName = this.getNodeParameter('eventName', i) as string;
            const errorMessage = this.getNodeParameter('errorMessage', i) as string;
            const errorType = this.getNodeParameter('errorType', i) as string;
            
            event = createCustomEvent(context, eventName, {
              error_message: errorMessage,
              error_type: errorType,
            }, nodeContext);
            event.event_type = 'error';
            event.status = 'failed';
            break;
          }

          default:
            throw new Error(`Unknown event type: ${eventType}`);
        }

        // Send the event
        await transport.send(event);
        await transport.close();

        // Return input data with event info attached
        returnData.push({
          json: {
            ...items[i].json,
            _telemetry_event: {
              event_id: event.event_id,
              event_type: event.event_type,
              timestamp: event.timestamp,
              sent: true,
            },
          },
          pairedItem: { item: i },
        });
      } catch (error) {
        await transport.close();
        
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              ...items[i].json,
              _telemetry_event: {
                error: (error as Error).message,
                sent: false,
              },
            },
            pairedItem: { item: i },
          });
        } else {
          throw error;
        }
      }
    }

    return [returnData];
  }
}
