import { NextRequest, NextResponse } from 'next/server';
import { saveEmailDraft } from '../../lib/db';

interface SaveEmailDraftRequest {
  username: string;
  subject: string;
  body: string;
}

export async function POST(request: NextRequest) {
  try {
    const { username, subject, body } = await request.json() as SaveEmailDraftRequest;
    
    if (!username || !subject || !body) {
      throw new Error('Missing required fields: username, subject, and body are required');
    }
    
    console.log(`Saving email draft for ${username}`);
    
    saveEmailDraft(username, subject, body);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Email draft saved successfully'
    });
  } catch (error) {
    console.error('Error saving email draft:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}