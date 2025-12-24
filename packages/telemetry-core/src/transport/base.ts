/**
 * Transport Interface
 * 
 * Defines the contract for telemetry event transport implementations
 */

import { TelemetryEvent } from '../events/types';

// ============ Transport Configuration ============

export interface TransportConfig {
  /**
   * Whether to buffer events before sending
   */
  buffered?: boolean;
  
  /**
   * Maximum number of events to buffer before auto-flush
   */
  bufferSize?: number;
  
  /**
   * Auto-flush interval in milliseconds
   */
  flushIntervalMs?: number;
  
  /**
   * Whether to redact sensitive data from payloads
   */
  redactPayloads?: boolean;
  
  /**
   * Fields to redact from event payloads
   */
  redactFields?: string[];
}

// ============ Transport Interface ============

export interface Transport {
  /**
   * Transport name for identification
   */
  readonly name: string;
  
  /**
   * Send a single telemetry event
   */
  send(event: TelemetryEvent): Promise<void>;
  
  /**
   * Send multiple telemetry events
   */
  sendBatch(events: TelemetryEvent[]): Promise<void>;
  
  /**
   * Flush any buffered events
   */
  flush(): Promise<void>;
  
  /**
   * Query events by execution ID
   */
  queryByExecution(executionId: string): Promise<TelemetryEvent[]>;
  
  /**
   * Query events by workflow ID
   */
  queryByWorkflow(workflowId: string): Promise<TelemetryEvent[]>;
  
  /**
   * Close the transport and cleanup resources
   */
  close(): Promise<void>;
}

// ============ Redaction Utility ============

const DEFAULT_REDACT_FIELDS = [
  'password',
  'secret',
  'token',
  'api_key',
  'apiKey',
  'authorization',
  'auth',
  'credentials',
  'private_key',
  'privateKey',
];

export function redactSensitiveData(
  obj: Record<string, unknown>,
  fields: string[] = DEFAULT_REDACT_FIELDS
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const shouldRedact = fields.some(f => lowerKey.includes(f.toLowerCase()));
    
    if (shouldRedact) {
      result[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactSensitiveData(value as Record<string, unknown>, fields);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => 
        item && typeof item === 'object' 
          ? redactSensitiveData(item as Record<string, unknown>, fields)
          : item
      );
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

// ============ Abstract Base Transport ============

export abstract class BaseTransport implements Transport {
  abstract readonly name: string;
  
  protected config: TransportConfig;
  protected buffer: TelemetryEvent[] = [];
  protected flushTimer?: NodeJS.Timeout;
  
  constructor(config: TransportConfig = {}) {
    this.config = {
      buffered: false,
      bufferSize: 100,
      flushIntervalMs: 5000,
      redactPayloads: true,
      redactFields: DEFAULT_REDACT_FIELDS,
      ...config,
    };
    
    if (this.config.buffered && this.config.flushIntervalMs) {
      this.flushTimer = setInterval(
        () => this.flush(),
        this.config.flushIntervalMs
      );
    }
  }
  
  protected prepareEvent(event: TelemetryEvent): TelemetryEvent {
    if (!this.config.redactPayloads) return event;
    
    const prepared = { ...event };
    
    if (prepared.payload) {
      prepared.payload = redactSensitiveData(
        prepared.payload as Record<string, unknown>,
        this.config.redactFields
      );
    }
    
    if (prepared.metadata) {
      prepared.metadata = redactSensitiveData(
        prepared.metadata,
        this.config.redactFields
      );
    }
    
    return prepared;
  }
  
  async send(event: TelemetryEvent): Promise<void> {
    const prepared = this.prepareEvent(event);
    
    if (this.config.buffered) {
      this.buffer.push(prepared);
      
      if (this.buffer.length >= (this.config.bufferSize || 100)) {
        await this.flush();
      }
    } else {
      await this.doSend(prepared);
    }
  }
  
  async sendBatch(events: TelemetryEvent[]): Promise<void> {
    const prepared = events.map(e => this.prepareEvent(e));
    
    if (this.config.buffered) {
      this.buffer.push(...prepared);
      
      if (this.buffer.length >= (this.config.bufferSize || 100)) {
        await this.flush();
      }
    } else {
      await this.doSendBatch(prepared);
    }
  }
  
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    
    const toFlush = [...this.buffer];
    this.buffer = [];
    
    await this.doSendBatch(toFlush);
  }
  
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    await this.flush();
    await this.doClose();
  }
  
  // Abstract methods to implement
  protected abstract doSend(event: TelemetryEvent): Promise<void>;
  protected abstract doSendBatch(events: TelemetryEvent[]): Promise<void>;
  protected abstract doClose(): Promise<void>;
  
  abstract queryByExecution(executionId: string): Promise<TelemetryEvent[]>;
  abstract queryByWorkflow(workflowId: string): Promise<TelemetryEvent[]>;
}
