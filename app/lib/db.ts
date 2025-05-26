import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

// Define interfaces for your data
export interface Influencer {
  id?: number;
  username: string;
  is_influencer: boolean;
  full_name?: string | null;
  bio?: string | null;
  email?: string | null;
  email_sent?: boolean;
  email_sent_at?: string | null;
  email_subject?: string | null;
  email_body?: string | null;
  email_generated_at?: string | null;
  dm_sent?: boolean;
  dm_sent_at?: string | null;
  dm_message?: string | null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../../influencers.db');

const db = new Database(dbPath);

export function getAllInfluencers(): Influencer[] {
  const rows = db.prepare('SELECT * FROM influencers').all() as any[];
  return rows.map(row => ({
    ...row,
    is_influencer: !!row.is_influencer,
    email_sent: !!row.email_sent,
    dm_sent: !!row.dm_sent
  }));
}

export function getInfluencerByUsername(username: string): Influencer | undefined {
  const row = db.prepare('SELECT * FROM influencers WHERE username = ?').get(username) as any;
  if (!row) return undefined;
  return {
    ...row,
    is_influencer: !!row.is_influencer,
    email_sent: !!row.email_sent,
    dm_sent: !!row.dm_sent
  };
}

export function updateEmailSentStatus(username: string, sent: boolean = true): void {
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE influencers SET email_sent = ?, email_sent_at = ? WHERE username = ?'
  ).run(sent ? 1 : 0, sent ? now : null, username);
}

export function saveEmailDraft(
  username: string, 
  subject: string, 
  body: string
): void {
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE influencers SET email_subject = ?, email_body = ?, email_generated_at = ? WHERE username = ?'
  ).run(subject, body, now, username);
}

export function getEmailDraft(username: string): { subject: string; body: string } | null {
  const influencer = getInfluencerByUsername(username);
  
  if (influencer && influencer.email_subject && influencer.email_body) {
    return {
      subject: influencer.email_subject,
      body: influencer.email_body
    };
  }
  
  return null;
}