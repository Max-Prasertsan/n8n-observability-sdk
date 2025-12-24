/**
 * File Transport
 * 
 * Writes telemetry events to a JSONL file with atomic append operations
 */

import * as fs from 'fs';
import * as path from 'path';
import { TelemetryEvent } from '../events/types';
import { BaseTransport, TransportConfig } from './base';

// ============ File Transport Configuration ============

export interface FileTransportConfig extends TransportConfig {
  /**
   * Path to the JSONL file
   */
  filePath: string;
  
  /**
   * Whether to create the directory if it doesn't exist
   */
  createDir?: boolean;
  
  /**
   * Whether to use file locking for atomic writes
   */
  useLocking?: boolean;
}

// ============ Simple File Lock ============

class FileLock {
  private locks = new Map<string, Promise<void>>();
  
  async acquire(filePath: string): Promise<() => void> {
    // Wait for any existing lock
    while (this.locks.has(filePath)) {
      await this.locks.get(filePath);
    }
    
    // Create release function and promise
    let release: () => void;
    const lockPromise = new Promise<void>(resolve => {
      release = resolve;
    });
    
    this.locks.set(filePath, lockPromise);
    
    return () => {
      this.locks.delete(filePath);
      release!();
    };
  }
}

const globalLock = new FileLock();

// ============ File Transport Implementation ============

export class FileTransport extends BaseTransport {
  readonly name = 'file';
  
  private filePath: string;
  private fileHandle?: fs.promises.FileHandle;
  private inMemoryStore: TelemetryEvent[] = [];
  
  constructor(config: FileTransportConfig) {
    super(config);
    
    this.filePath = path.resolve(config.filePath);
    
    // Create directory if needed
    if (config.createDir !== false) {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    
    // Load existing events into memory for querying
    this.loadExistingEvents();
  }
  
  private loadExistingEvents(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const event = JSON.parse(line) as TelemetryEvent;
            this.inMemoryStore.push(event);
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (error) {
      console.error('[FileTransport] Error loading existing events:', error);
    }
  }
  
  protected async doSend(event: TelemetryEvent): Promise<void> {
    await this.appendToFile([event]);
    this.inMemoryStore.push(event);
  }
  
  protected async doSendBatch(events: TelemetryEvent[]): Promise<void> {
    await this.appendToFile(events);
    this.inMemoryStore.push(...events);
  }
  
  private async appendToFile(events: TelemetryEvent[]): Promise<void> {
    const config = this.config as FileTransportConfig;
    
    const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
    
    if (config.useLocking !== false) {
      const release = await globalLock.acquire(this.filePath);
      try {
        await fs.promises.appendFile(this.filePath, lines, 'utf-8');
      } finally {
        release();
      }
    } else {
      await fs.promises.appendFile(this.filePath, lines, 'utf-8');
    }
  }
  
  async queryByExecution(executionId: string): Promise<TelemetryEvent[]> {
    return this.inMemoryStore.filter(e => e.execution_id === executionId);
  }
  
  async queryByWorkflow(workflowId: string): Promise<TelemetryEvent[]> {
    return this.inMemoryStore.filter(e => e.workflow_id === workflowId);
  }
  
  /**
   * Query all events (for debugging/viewing)
   */
  async queryAll(): Promise<TelemetryEvent[]> {
    return [...this.inMemoryStore];
  }
  
  /**
   * Get events from file (re-reads file)
   */
  async readFromFile(): Promise<TelemetryEvent[]> {
    const events: TelemetryEvent[] = [];
    
    try {
      if (!fs.existsSync(this.filePath)) {
        return events;
      }
      
      const content = await fs.promises.readFile(this.filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          events.push(JSON.parse(line) as TelemetryEvent);
        } catch {
          // Skip malformed lines
        }
      }
    } catch (error) {
      console.error('[FileTransport] Error reading file:', error);
    }
    
    return events;
  }
  
  protected async doClose(): Promise<void> {
    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = undefined;
    }
  }
  
  /**
   * Clear all events (for testing)
   */
  async clear(): Promise<void> {
    this.inMemoryStore = [];
    
    if (fs.existsSync(this.filePath)) {
      await fs.promises.writeFile(this.filePath, '', 'utf-8');
    }
  }
}
