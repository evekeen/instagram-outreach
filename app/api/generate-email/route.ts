import OpenAI from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import { Influencer, saveEmailDraft } from '../../lib/db';
import { z } from 'zod';
import { zodResponseFormat } from "openai/helpers/zod";

// Check if API key is set
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set in environment variables');
}

// Initialize OpenAI with explicit API key from environment
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface EmailResponse {
  subject: string;
  body: string;
}

const EmailFormatObject = z.object({
  subject: z.string(),
  body: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    // Validate OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is not configured');
    }
    
    // Parse request body
    const body = await request.json();
    console.log('Request body:', body);
    
    if (!body.influencer) {
      throw new Error('Missing influencer data in request');
    }
    
    const { influencer } = body as { influencer: Influencer };
    
    console.log('Generating email for:', influencer);
    
    const prompt = `Write a professional email to ${influencer.full_name || influencer.username} about joining our affiliate program for Ace Trace app. 
    Details about the offer:
      - they promote the app on their social media
      - they have a personal promo code for the app
      - the  get the app for free
      - they get 15% of the revenue from the app via the promo code      
      - users get 10% of the app via the promo code
      - we wire them money monthly and provide the promo code reports

    The person is an Instagram influencer with the following bio: ${influencer.bio || 'No bio available'}
    
    The email should:
    1. Be personalized based on their bio and content
    2. Explain the benefits of joining our affiliate program
    3. Be concise and engaging
    4. Include a clear call to action

    Do not use markdown, use plain text formatting. No bullshit, be professional and direct. Outline the benefits and the value proposition.

    My signature:
    "Best regards, 
      Alexander."
    
    Format the response as JSON with 'subject' and 'body' fields.`;

    // Call OpenAI API
    try {
      const completion = await openai.beta.chat.completions.parse({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a professional email writer specializing in influencer outreach."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: zodResponseFormat(EmailFormatObject, "email"),
      });
      
      console.log('OpenAI response received');
      
      // Parse JSON from completion
      try {
        const email = completion.choices[0].message.parsed;
        console.log('Email:', email);
        
        // Save the email draft to the database
        if (influencer.username && email.subject && email.body) {
          saveEmailDraft(influencer.username, email.subject, email.body);
          console.log('Email draft saved to database for', influencer.username);
        }
        
        return NextResponse.json(email);
      } catch (parseError) {
        console.error('Error parsing OpenAI response:', parseError);
        console.log('Raw response:', completion.choices[0].message.content);
        throw new Error('Failed to parse OpenAI response');
      }
    } catch (apiError) {
      console.error('OpenAI API error:', apiError);
      throw apiError;
    }
  } catch (error) {
    console.error('Email generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
