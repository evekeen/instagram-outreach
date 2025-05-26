import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

// Track running process
let runningProcess: any = null;

export async function GET() {
  try {
    // Check if there's already a running process
    const controlFile = path.join(process.cwd(), 'yolo_control.json');
    const progressFile = path.join(process.cwd(), 'yolo_progress.json');
    
    try {
      const control = JSON.parse(await fs.readFile(controlFile, 'utf-8'));
      const progress = JSON.parse(await fs.readFile(progressFile, 'utf-8'));
      
      // Check if process is actually running
      if (progress.is_running) {
        return NextResponse.json({ 
          status: 'already_running',
          message: 'YOLO process is already running',
          progress: progress.latest_update
        });
      }
    } catch (error) {
      // Files don't exist or can't be read, which is fine
    }
    
    // Clear any existing progress files
    try {
      await fs.unlink(progressFile);
    } catch (error) {
      // File doesn't exist, which is fine
    }
    
    // Start the YOLO process
    const scriptPath = path.join(process.cwd(), 'yolo_outreach.py');
    
    runningProcess = spawn('python', [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env },
      detached: false
    });
    
    runningProcess.on('error', (error: any) => {
      console.error('Failed to start YOLO process:', error);
      runningProcess = null;
    });
    
    runningProcess.on('exit', (code: number) => {
      console.log(`YOLO process exited with code ${code}`);
      runningProcess = null;
    });
    
    // Log output for debugging
    runningProcess.stdout.on('data', (data: Buffer) => {
      console.log('YOLO stdout:', data.toString());
    });
    
    runningProcess.stderr.on('data', (data: Buffer) => {
      console.error('YOLO stderr:', data.toString());
    });
    
    return NextResponse.json({ 
      status: 'started',
      message: 'YOLO process started successfully'
    });
    
  } catch (error) {
    console.error('Failed to start YOLO process:', error);
    return NextResponse.json({ 
      status: 'error',
      message: 'Failed to start YOLO process',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { command } = await request.json();
    
    if (command === 'stop') {
      const controlFile = path.join(process.cwd(), 'yolo_control.json');
      
      // Write stop command to control file
      await fs.writeFile(
        controlFile,
        JSON.stringify({ command: 'stop', timestamp: Date.now() })
      );
      
      // Also try to kill the process if we have a reference
      if (runningProcess) {
        runningProcess.kill('SIGTERM');
        runningProcess = null;
      }
      
      return NextResponse.json({ 
        status: 'success',
        message: 'Stop command sent'
      });
    }
    
    return NextResponse.json({ 
      status: 'error',
      message: 'Invalid command'
    }, { status: 400 });
    
  } catch (error) {
    console.error('YOLO control error:', error);
    return NextResponse.json({ 
      status: 'error',
      message: 'Failed to process command'
    }, { status: 500 });
  }
}