// Migration script to add new columns to the influencers table
const Database = require('better-sqlite3');
const path = require('path');

// Connect to the database
const db = new Database(path.join(__dirname, 'influencers.db'));

console.log('Starting database migration...');

// Begin transaction
db.prepare('BEGIN TRANSACTION').run();

try {
  // Check if the email_subject column exists
  const tableInfo = db.prepare(`PRAGMA table_info(influencers)`).all();
  const columns = tableInfo.map(col => col.name);
  
  console.log('Current table columns:', columns);
  
  // Add email_sent and email_sent_at columns if they don't exist
  if (!columns.includes('email_sent')) {
    console.log('Adding email_sent column...');
    db.prepare('ALTER TABLE influencers ADD COLUMN email_sent BOOLEAN DEFAULT FALSE').run();
  }
  
  if (!columns.includes('email_sent_at')) {
    console.log('Adding email_sent_at column...');
    db.prepare('ALTER TABLE influencers ADD COLUMN email_sent_at TIMESTAMP').run();
  }
  
  // Add email_subject, email_body, and email_generated_at columns if they don't exist
  if (!columns.includes('email_subject')) {
    console.log('Adding email_subject column...');
    db.prepare('ALTER TABLE influencers ADD COLUMN email_subject TEXT').run();
  }
  
  if (!columns.includes('email_body')) {
    console.log('Adding email_body column...');
    db.prepare('ALTER TABLE influencers ADD COLUMN email_body TEXT').run();
  }
  
  if (!columns.includes('email_generated_at')) {
    console.log('Adding email_generated_at column...');
    db.prepare('ALTER TABLE influencers ADD COLUMN email_generated_at TIMESTAMP').run();
  }

  // Commit transaction
  db.prepare('COMMIT').run();
  console.log('Migration completed successfully!');
} catch (error) {
  // Rollback on error
  db.prepare('ROLLBACK').run();
  console.error('Migration failed:', error);
}

// Close the database connection
db.close();