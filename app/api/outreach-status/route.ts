import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const rootDir = path.resolve('.');
    const progressFilePath = path.join(rootDir, 'outreach_progress.json');
    
    // Check if the file exists
    if (!fs.existsSync(progressFilePath)) {
      return NextResponse.json({ 
        status: 'not_running',
        message: 'No active outreach process found',
        progress: null,
        logs: []
      });
    }
    
    // Read the progress file
    const progressData = JSON.parse(fs.readFileSync(progressFilePath, 'utf8'));
    
    return NextResponse.json({
      status: progressData.progress.is_running ? 'running' : 'stopped',
      progress: progressData.progress,
      logs: progressData.logs,
      timestamp: progressData.timestamp
    });
  } catch (error) {
    console.error('Error reading outreach status:', error);
    return NextResponse.json({ 
      status: 'error',
      message: 'Error reading outreach status', 
      error: String(error)
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const rootDir = path.resolve('.');
    const controlFilePath = path.join(rootDir, 'outreach_control.json');
    const { command } = await request.json();
    
    if (command !== 'stop' && command !== 'run') {
      return NextResponse.json({ 
        error: 'Invalid command. Only "stop" and "run" are supported.' 
      }, { status: 400 });
    }
    
    // Write to the control file
    fs.writeFileSync(controlFilePath, JSON.stringify({
      command,
      timestamp: Date.now()
    }));
    
    return NextResponse.json({ 
      status: 'success',
      message: `Command "${command}" sent successfully`
    });
  } catch (error) {
    console.error('Error sending command to outreach process:', error);
    return NextResponse.json({ 
      status: 'error',
      message: 'Error sending command', 
      error: String(error)
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';