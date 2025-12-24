/**
 * Multi Transport
 * 
 * Sends telemetry events to multiple transports simultaneously
 */

import { TelemetryEvent } from '../events/types';
import { Transport } from './base';

export class MultiTransport implements Transport {
  readonly name = 'multi';
  
  private transports: Transport[];
  
  constructor(transports: Transport[]) {
    this.transports = transports;
  }
  
  async send(event: TelemetryEvent): Promise<void> {
    await Promise.all(
      this.transports.map(t => t.send(event).catch(err => {
        console.error(`[MultiTransport] ${t.name} failed:`, err);
      }))
    );
  }
  
  async sendBatch(events: TelemetryEvent[]): Promise<void> {
    await Promise.all(
      this.transports.map(t => t.sendBatch(events).catch(err => {
        console.error(`[MultiTransport] ${t.name} failed:`, err);
      }))
    );
  }
  
  async flush(): Promise<void> {
    await Promise.all(
      this.transports.map(t => t.flush().catch(err => {
        console.error(`[MultiTransport] ${t.name} flush failed:`, err);
      }))
    );
  }
  
  async queryByExecution(executionId: string): Promise<TelemetryEvent[]> {
    // Query from first transport that returns results
    for (const transport of this.transports) {
      const events = await transport.queryByExecution(executionId);
      if (events.length > 0) {
        return events;
      }
    }
    return [];
  }
  
  async queryByWorkflow(workflowId: string): Promise<TelemetryEvent[]> {
    // Query from first transport that returns results
    for (const transport of this.transports) {
      const events = await transport.queryByWorkflow(workflowId);
      if (events.length > 0) {
        return events;
      }
    }
    return [];
  }
  
  async close(): Promise<void> {
    await Promise.all(
      this.transports.map(t => t.close().catch(err => {
        console.error(`[MultiTransport] ${t.name} close failed:`, err);
      }))
    );
  }
  
  /**
   * Add a transport at runtime
   */
  addTransport(transport: Transport): void {
    this.transports.push(transport);
  }
  
  /**
   * Remove a transport by name
   */
  removeTransport(name: string): void {
    this.transports = this.transports.filter(t => t.name !== name);
  }
  
  /**
   * Get all transports
   */
  getTransports(): Transport[] {
    return [...this.transports];
  }
}
