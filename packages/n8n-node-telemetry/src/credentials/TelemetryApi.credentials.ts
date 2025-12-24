import {
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class TelemetryApi implements ICredentialType {
  name = 'telemetryApi';
  displayName = 'Telemetry API';
  documentationUrl = 'https://github.com/your-org/n8n-telemetry-sdk';
  
  properties: INodeProperties[] = [
    {
      displayName: 'HTTP Endpoint',
      name: 'httpEndpoint',
      type: 'string',
      default: 'http://localhost:3001/events',
      placeholder: 'http://localhost:3001/events',
      description: 'The HTTP endpoint to send telemetry events to (optional)',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      description: 'API key for the telemetry endpoint (optional)',
    },
    {
      displayName: 'File Path',
      name: 'filePath',
      type: 'string',
      default: './data/events.jsonl',
      description: 'Path to the JSONL file for storing events',
    },
  ];
}
