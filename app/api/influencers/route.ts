import { getAllInfluencers } from '../../lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const influencers = getAllInfluencers();
    return NextResponse.json(influencers);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}