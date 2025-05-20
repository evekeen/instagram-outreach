CREATE TABLE IF NOT EXISTS influencers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    full_name TEXT,
    bio TEXT,
    email TEXT,
    is_influencer BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMP,
    email_subject TEXT,
    email_body TEXT,
    email_generated_at TIMESTAMP
); 

CREATE TABLE IF NOT EXISTS hashtag_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hashtags TEXT,
    results_limit INTEGER,
    username TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hashtags, results_limit, username)
);