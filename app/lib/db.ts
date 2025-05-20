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
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../../influencers.db');

const db = new Database(dbPath);

export function getAllInfluencers(): Influencer[] {
  return db.prepare('SELECT * FROM influencers').all() as Influencer[];
}

export function getInfluencerByUsername(username: string): Influencer | undefined {
  return db.prepare('SELECT * FROM influencers WHERE username = ?').get(username) as Influencer | undefined;
}