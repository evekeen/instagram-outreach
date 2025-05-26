import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

export async function GET() {
  try {
    const progressFile = path.join(process.cwd(), 'yolo_progress.json');
    const logsFile = path.join(process.cwd(), 'yolo_logs.json');
    
    let progress = null;
    let logs = [];
    
    // Read progress file
    try {
      const progressData = await fs.readFile(progressFile, 'utf-8');
      const progressJson = JSON.parse(progressData);
      progress = progressJson.latest_update;
    } catch (error) {
      // No progress file yet
    }
    
    // Read logs file
    try {
      const logsData = await fs.readFile(logsFile, 'utf-8');
      const logsJson = JSON.parse(logsData);
      logs = logsJson.logs || [];
    } catch (error) {
      // No logs file yet
    }
    
    // Determine status
    let status = 'not_running';
    if (progress) {
      if (progress.is_running) {
        status = 'running';
      } else if (progress.stage === 'complete') {
        status = 'complete';
      } else if (progress.stage === 'error') {
        status = 'error';
      }
    }
    
    return NextResponse.json({
      status,
      progress,
      logs
    });
    
  } catch (error) {
    console.error('Error checking YOLO status:', error);
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}