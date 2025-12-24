#!/usr/bin/env node

/**
 * View Events CLI
 * 
 * Usage:
 *   npm run view                           # View all events
 *   npm run view -- --execution <id>       # Filter by execution ID
 *   npm run view -- --summary              # Show summary only
 *   npm run view -- --timeline -e <id>     # Show timeline view
 */

const fs = require('fs');
const DEFAULT_FILE_PATH = './data/events.jsonl';

const colors = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
};

const colorize = (text, color) => `${colors[color]}${text}${colors.reset}`;

function readEvents(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, 'utf-8').trim().split('\n')
    .filter(line => line.trim())
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function formatDuration(ms) {
  if (ms === undefined) return '-';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function displaySummary(events) {
  const executions = new Map();
  for (const e of events) {
    if (!executions.has(e.execution_id)) {
      executions.set(e.execution_id, { workflow_name: e.workflow_name, events: [], eval: null });
    }
    const exec = executions.get(e.execution_id);
    exec.events.push(e);
    if (e.event_type === 'eval.completed') exec.eval = e;
  }
  
  console.log(colorize('\n=== Telemetry Summary ===\n', 'bright'));
  console.log(`Total Events: ${events.length}`);
  console.log(`Unique Executions: ${executions.size}\n`);
  
  for (const [execId, exec] of executions) {
    const end = exec.events.find(e => e.event_type.includes('workflow.completed') || e.event_type.includes('workflow.failed'));
    const status = end?.status || 'unknown';
    const statusCol = status === 'completed' ? 'green' : status === 'failed' ? 'red' : 'yellow';
    
    console.log(colorize(exec.workflow_name || 'Unknown', 'bright'));
    console.log(`  ID: ${execId.substring(0, 8)}...  Status: ${colorize(status, statusCol)}  Duration: ${formatDuration(end?.duration_ms)}`);
    if (exec.eval) {
      const score = exec.eval.payload.score;
      console.log(`  Score: ${colorize(score, score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red')}/100  Labels: ${exec.eval.payload.labels.join(', ') || 'none'}`);
    }
    console.log();
  }
}

function displayTimeline(events, executionId) {
  const execEvents = events.filter(e => e.execution_id === executionId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  if (!execEvents.length) { console.error(`No events for: ${executionId}`); return; }
  
  console.log(colorize(`\n=== Timeline: ${execEvents[0].workflow_name} ===\n`, 'bright'));
  
  for (const e of execEvents) {
    const time = new Date(e.timestamp).toLocaleTimeString('en-US', { hour12: false });
    const icon = e.status === 'completed' ? '●' : e.status === 'failed' ? '✗' : '○';
    const statCol = e.status === 'completed' ? 'green' : e.status === 'failed' ? 'red' : 'blue';
    
    let line = `${time} ${colorize(icon, statCol)} ${e.event_type}`;
    if (e.node_context) line += ` - ${e.node_context.node_name}`;
    if (e.duration_ms !== undefined) line += ` (${formatDuration(e.duration_ms)})`;
    console.log(line);
    
    if (e.event_type === 'eval.completed') {
      console.log(`         Score: ${e.payload.score}/100`);
      e.payload.reasons.forEach(r => console.log(`         → ${r}`));
    }
  }
  console.log();
}

function displayEvents(events) {
  console.log(colorize(`\n=== Events (${events.length}) ===\n`, 'bright'));
  events.forEach((e, i) => {
    console.log(`[${i + 1}] ${e.event_type} (${e.status})`);
    console.log(`    Execution: ${e.execution_id.substring(0, 8)}...  Duration: ${formatDuration(e.duration_ms)}`);
    if (e.node_context) console.log(`    Node: ${e.node_context.node_name}`);
    console.log();
  });
}

// Parse args
const args = process.argv.slice(2);
const options = { file: DEFAULT_FILE_PATH, execution: null, summary: false, timeline: false };

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-f' || args[i] === '--file') options.file = args[++i];
  if (args[i] === '-e' || args[i] === '--execution') options.execution = args[++i];
  if (args[i] === '-s' || args[i] === '--summary') options.summary = true;
  if (args[i] === '--timeline') options.timeline = true;
}

const events = readEvents(options.file);
if (!events.length) { console.log('No events found.'); process.exit(0); }

let filtered = options.execution ? events.filter(e => e.execution_id === options.execution) : events;

if (options.timeline && options.execution) displayTimeline(events, options.execution);
else if (options.summary) displaySummary(filtered);
else displayEvents(filtered);
