import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { Influencer } from '../../lib/db';

// Load environment variables
import 'dotenv/config';

interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  influencer: Influencer;
}

export async function POST(request: NextRequest) {
  try {
    // Check if Gmail credentials are configured
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      throw new Error('Gmail credentials not configured');
    }
    
    // Parse request body
    const { to, subject, body, influencer } = await request.json() as SendEmailRequest;
    
    if (!to || !subject || !body) {
      throw new Error('Missing required email fields');
    }
    
    console.log(`Sending email to ${to} with subject: ${subject}`);
    
    // Configure nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
    
    // Format the email
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: to,
      subject: subject,
      text: body,
      html: body.replace(/\n/g, '<br>'),
    };
    
    // Send the email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    
    // Record the email sent in the database if needed
    // Here you could add code to track that an email was sent to this influencer
    
    return NextResponse.json({ 
      success: true, 
      message: 'Email sent successfully',
      emailId: info.messageId 
    });
  } catch (error) {
    console.error('Error sending email:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}