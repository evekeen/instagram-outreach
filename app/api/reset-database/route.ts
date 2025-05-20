import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Simple authentication for dangerous operations
const AUTH_TOKEN = 'reset-token-12345'; // In a real app, use a proper auth system

export async function POST(request: NextRequest) {
  try {
    // Get the request body
    const body = await request.json();
    
    // Validate the token
    if (!body.token || body.token !== AUTH_TOKEN) {
      return NextResponse.json({
        status: 'error',
        message: 'Unauthorized'
      }, { status: 401 });
    }
    
    // Get the root directory of the project
    const rootDir = path.resolve('.');
    
    // Execute the reset script with the force flag
    const resetProcess = spawn('python3', ['reset_db.py', '--force'], {
      cwd: rootDir,
    });
    
    // Collect output
    let output = '';
    let errorOutput = '';
    
    resetProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    resetProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    // Wait for the process to complete
    const exitCode = await new Promise<number>((resolve) => {
      resetProcess.on('close', resolve);
    });
    
    if (exitCode === 0) {
      // Also remove any progress or control files if they exist
      const filesToClean = [
        'outreach_progress.json', 
        'outreach_control.json'
      ];
      
      filesToClean.forEach(file => {
        const filePath = path.join(rootDir, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
      
      return NextResponse.json({
        status: 'success',
        message: 'Database reset successfully',
        details: output
      });
    } else {
      return NextResponse.json({
        status: 'error',
        message: 'Failed to reset database',
        details: errorOutput || output,
        exitCode
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error resetting database:', error);
    return NextResponse.json({ 
      status: 'error',
      message: 'Error resetting database', 
      error: String(error)
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';