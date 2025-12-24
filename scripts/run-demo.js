#!/usr/bin/env node

/**
 * Demo Runner
 * 
 * Runs simulation workflows to generate sample telemetry data.
 * This allows testing the telemetry system without a full n8n installation.
 * 
 * Usage:
 *   node scripts/run-demo.js
 */

const path = require('path');

// Since we're in a monorepo, we need to build first
// This script assumes the packages have been built

async function main() {
  console.log('🚀 n8n Telemetry SDK Demo\n');
  console.log('This demo simulates workflow executions to generate telemetry events.\n');
  
  try {
    // Try to load the extension package
    const extensionPath = path.join(__dirname, '../packages/n8n-extension-telemetry/dist/index.js');
    
    let extension;
    try {
      extension = require(extensionPath);
    } catch (e) {
      console.log('⚠️  Extension not built. Building now...\n');
      
      const { execSync } = require('child_process');
      execSync('npm run build', { 
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit' 
      });
      
      extension = require(extensionPath);
    }
    
    // Run the demo simulation
    await extension.runDemoSimulation({
      filePath: './data/events.jsonl',
      enableEvaluation: true,
    });
    
    console.log('To view the events, run:');
    console.log('  npm run view\n');
    console.log('Or filter by execution:');
    console.log('  npm run view -- --execution <id>\n');
    
  } catch (error) {
    console.error('Error running demo:', error);
    process.exit(1);
  }
}

main();
