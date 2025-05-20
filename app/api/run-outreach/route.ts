import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function GET() {
  try {
    // Get the root directory of the project
    const rootDir = path.resolve('.');
    const progressFilePath = path.join(rootDir, 'outreach_progress.json');
    const controlFilePath = path.join(rootDir, 'outreach_control.json');
    
    // Check if progress file exists - if it does and shows process is running, don't start a new one
    if (fs.existsSync(progressFilePath)) {
      try {
        const progressData = JSON.parse(fs.readFileSync(progressFilePath, 'utf8'));
        if (progressData.progress.is_running) {
          return NextResponse.json({
            status: 'already_running',
            message: 'An outreach process is already running',
            progress: progressData.progress
          });
        }
      } catch (e) {
        console.error('Error reading progress file:', e);
        // Continue and attempt to start a new process if the file is corrupt
      }
    }
    
    // Initialize control file to "run"
    fs.writeFileSync(controlFilePath, JSON.stringify({
      command: "run",
      timestamp: Date.now()
    }));
    
    console.log('Starting outreach.py from directory:', rootDir);
    
    // Start the outreach.py process with unbuffered output
    const pythonProcess = spawn('python3', ['-u', 'outreach.py'], {
      cwd: rootDir,
      detached: true, // Run in the background
      stdio: 'ignore'  // Detach stdin/stdout/stderr
    });
    
    // Detach the process to run in background
    pythonProcess.unref();
    
    return NextResponse.json({
      status: 'started',
      message: 'Outreach process started',
      pid: pythonProcess.pid
    });
  } catch (error) {
    console.error('Error starting outreach process:', error);
    return NextResponse.json({ 
      status: 'error',
      message: 'Error starting outreach process', 
      error: String(error)
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';