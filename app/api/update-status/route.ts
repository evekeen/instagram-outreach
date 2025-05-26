import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { username, statusType, value } = await request.json();

    if (!username || !statusType) {
      return NextResponse.json({ error: 'Username and status type are required' }, { status: 400 });
    }

    const db = new Database(path.join(process.cwd(), 'influencers.db'));
    
    try {
      let stmt;
      
      switch (statusType) {
        case 'email_sent':
          stmt = db.prepare(
            `UPDATE influencers 
             SET email_sent = ?, 
                 email_sent_at = ?
             WHERE username = ?`
          );
          stmt.run(value ? 1 : 0, value ? new Date().toISOString() : null, username);
          break;
          
        case 'dm_sent':
          stmt = db.prepare(
            `UPDATE influencers 
             SET dm_sent = ?, 
                 dm_sent_at = ?
             WHERE username = ?`
          );
          stmt.run(value ? 1 : 0, value ? new Date().toISOString() : null, username);
          break;
          
        case 'reset':
          // Reset all statuses
          stmt = db.prepare(
            `UPDATE influencers 
             SET email_sent = 0, 
                 email_sent_at = NULL,
                 dm_sent = 0,
                 dm_sent_at = NULL
             WHERE username = ?`
          );
          stmt.run(username);
          break;
          
        default:
          return NextResponse.json({ error: 'Invalid status type' }, { status: 400 });
      }
      
      console.log(`Updated ${statusType} status for ${username} to ${value}`);
      
      return NextResponse.json({ 
        success: true, 
        message: `Status updated successfully`
      });
      
    } catch (dbError) {
      console.error('Failed to update database:', dbError);
      return NextResponse.json({ 
        error: 'Failed to update status' 
      }, { status: 500 });
    } finally {
      db.close();
    }
    
  } catch (error) {
    console.error('Update status API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}