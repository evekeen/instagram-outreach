import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import Database from 'better-sqlite3';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { username, message, influencer } = await request.json();

    if (!username || !message) {
      return NextResponse.json({ error: 'Username and message are required' }, { status: 400 });
    }

    // Save the message to a temporary file to pass to the Python script
    const tempDir = '/tmp';
    const messageFile = path.join(tempDir, `dm_${username}_${Date.now()}.json`);
    
    await fs.writeFile(messageFile, JSON.stringify({
      username,
      message,
      timestamp: new Date().toISOString()
    }));

    // Call Python script to send Instagram DM
    const scriptPath = path.join(process.cwd(), 'send_instagram_dm.py');
    
    try {
      const { stdout, stderr } = await execAsync(
        `python "${scriptPath}" "${username}" "${messageFile}"`,
        {
          timeout: 120000, // 120 second timeout (increased from 60)
          maxBuffer: 1024 * 1024 // 1MB buffer
        }
      );

      // Clean up the temporary file
      await fs.unlink(messageFile).catch(() => {});

      // Check if stderr only contains harmless deprecation warnings
      const isOnlyWarnings = stderr && (
        stderr.includes('DeprecationWarning') || 
        stderr.includes('WARNING')
      ) && !stderr.includes('ERROR') && !stderr.includes('CRITICAL');

      if (stderr && !isOnlyWarnings) {
        console.error('Instagram DM script stderr:', stderr);
        return NextResponse.json({ 
          error: 'Failed to send Instagram DM', 
          details: stderr 
        }, { status: 500 });
      }

      // Parse the result
      try {
        const result = JSON.parse(stdout);
        if (result.success) {
          // Update database to track DM sent status
          const db = new Database(path.join(process.cwd(), 'influencers.db'));
          
          try {
            const stmt = db.prepare(
              `UPDATE influencers 
               SET dm_sent = 1, 
                   dm_sent_at = datetime('now'),
                   dm_message = ?
               WHERE username = ?`
            );
            
            stmt.run(message, username);
            console.log(`Updated DM sent status for ${username}`);
          } catch (dbError) {
            console.error('Failed to update database:', dbError);
            // Continue even if database update fails
          } finally {
            db.close();
          }
          
          return NextResponse.json({ 
            success: true, 
            message: 'Instagram DM sent successfully',
            username 
          });
        } else {
          return NextResponse.json({ 
            error: result.error || 'Failed to send Instagram DM' 
          }, { status: 500 });
        }
      } catch (parseError) {
        console.error('Failed to parse Instagram DM script output:', stdout);
        return NextResponse.json({ 
          error: 'Invalid response from Instagram DM script' 
        }, { status: 500 });
      }
    } catch (execError: any) {
      console.error('Instagram DM script execution error:', execError);
      
      // Clean up the temporary file in case of error
      await fs.unlink(messageFile).catch(() => {});
      
      // Check if it's a timeout error with exit code 120
      if (execError.code === 120 && execError.killed === true) {
        // Check if we got far enough in the process (saw the message being typed)
        const output = execError.stdout || '';
        if (output.includes('Clicked button with index') && output.includes('Message')) {
          console.log(`Instagram DM likely sent successfully for ${username} despite timeout`);
          
          // Update database to track DM sent status
          const db = new Database(path.join(process.cwd(), 'influencers.db'));
          
          try {
            const stmt = db.prepare(
              `UPDATE influencers 
               SET dm_sent = 1, 
                   dm_sent_at = datetime('now'),
                   dm_message = ?
               WHERE username = ?`
            );
            
            stmt.run(message, username);
            console.log(`Updated DM sent status for ${username} (after timeout)`);
          } catch (dbError) {
            console.error('Failed to update database:', dbError);
          } finally {
            db.close();
          }
          
          return NextResponse.json({ 
            success: true, 
            message: 'Instagram DM sent successfully (process timed out but message was likely delivered)',
            username 
          });
        }
      }
      
      return NextResponse.json({ 
        error: 'Failed to execute Instagram DM script',
        details: execError.message 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Instagram DM API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}