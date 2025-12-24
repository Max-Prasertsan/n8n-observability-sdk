/**
 * HTTP Transport
 * 
 * Sends telemetry events to a HTTP endpoint
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { TelemetryEvent } from '../events/types';
import { BaseTransport, TransportConfig } from './base';

// ============ HTTP Transport Configuration ============

export interface HttpTransportConfig extends TransportConfig {
  /**
   * The endpoint URL to send events to
   */
  endpoint: string;
  
  /**
   * HTTP headers to include in requests
   */
  headers?: Record<string, string>;
  
  /**
   * Request timeout in milliseconds
   */
  timeoutMs?: number;
  
  /**
   * Number of retry attempts on failure
   */
  retries?: number;
  
  /**
   * Delay between retries in milliseconds
   */
  retryDelayMs?: number;
}

// ============ HTTP Transport Implementation ============

export class HttpTransport extends BaseTransport {
  readonly name = 'http';
  
  private endpoint: URL;
  private headers: Record<string, string>;
  private timeoutMs: number;
  private retries: number;
  private retryDelayMs: number;
  
  // In-memory store for querying (optional, could be disabled)
  private eventCache: Map<string, TelemetryEvent[]> = new Map();
  
  constructor(config: HttpTransportConfig) {
    super({
      ...config,
      buffered: config.buffered ?? true,
      bufferSize: config.bufferSize ?? 50,
    });
    
    this.endpoint = new URL(config.endpoint);
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
    this.timeoutMs = config.timeoutMs ?? 10000;
    this.retries = config.retries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;
  }
  
  protected async doSend(event: TelemetryEvent): Promise<void> {
    await this.sendToEndpoint([event]);
    this.cacheEvent(event);
  }
  
  protected async doSendBatch(events: TelemetryEvent[]): Promise<void> {
    await this.sendToEndpoint(events);
    events.forEach(e => this.cacheEvent(e));
  }
  
  private cacheEvent(event: TelemetryEvent): void {
    const executionEvents = this.eventCache.get(event.execution_id) || [];
    executionEvents.push(event);
    this.eventCache.set(event.execution_id, executionEvents);
  }
  
  private async sendToEndpoint(events: TelemetryEvent[]): Promise<void> {
    const body = JSON.stringify({ events });
    
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        await this.makeRequest(body);
        return;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.retries) {
          await this.delay(this.retryDelayMs * (attempt + 1));
        }
      }
    }
    
    console.error('[HttpTransport] Failed to send events after retries:', lastError);
    throw lastError;
  }
  
  private makeRequest(body: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const isHttps = this.endpoint.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const options: http.RequestOptions = {
        hostname: this.endpoint.hostname,
        port: this.endpoint.port || (isHttps ? 443 : 80),
        path: this.endpoint.pathname + this.endpoint.search,
        method: 'POST',
        headers: {
          ...this.headers,
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: this.timeoutMs,
      };
      
      const req = client.request(options, (res) => {
        let responseBody = '';
        
        res.on('data', chunk => {
          responseBody += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.write(body);
      req.end();
    });
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async queryByExecution(executionId: string): Promise<TelemetryEvent[]> {
    return this.eventCache.get(executionId) || [];
  }
  
  async queryByWorkflow(workflowId: string): Promise<TelemetryEvent[]> {
    const events: TelemetryEvent[] = [];
    
    for (const executionEvents of this.eventCache.values()) {
      events.push(...executionEvents.filter(e => e.workflow_id === workflowId));
    }
    
    return events;
  }
  
  protected async doClose(): Promise<void> {
    // Nothing to close for HTTP transport
  }
}
