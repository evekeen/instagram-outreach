import sqlite3
import json
import os
from typing import List, Dict, Any, Optional, Set
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class DatabaseHelper:
    """Helper class for interacting with the SQLite database."""
    
    def __init__(self, db_path: str = 'influencers.db'):
        self.db_path = db_path
        # Initialize the database if it doesn't exist
        self.init_db()
        
    def get_connection(self):
        """Get a connection to the SQLite database."""
        return sqlite3.connect(self.db_path)
    
    def init_db(self):
        """Initialize the database with the schema."""
        conn = self.get_connection()
        try:
            with open('schema.sql', 'r') as f:
                conn.executescript(f.read())
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
        finally:
            conn.close()
    
    def get_usernames_from_cache(self, hashtags: List[str], results_limit: int) -> Set[str]:
        """Get usernames from the database cache that are not expired (30 minutes)."""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            
            # Convert hashtags to a consistent string format for caching
            hashtags_str = ','.join(sorted(hashtags))
            
            # Check if we have cached usernames for these hashtags and limit
            # Only get entries that are less than 30 minutes old
            cursor.execute('''
                SELECT username FROM hashtag_cache 
                WHERE hashtags = ? AND results_limit = ?
                AND datetime(created_at) > datetime('now', '-30 minutes')
            ''', (hashtags_str, results_limit))
            
            usernames = set(row[0] for row in cursor.fetchall())
            
            if usernames:
                logger.info(f"Found {len(usernames)} cached usernames (not expired)")
            
            return usernames
        except Exception as e:
            logger.error(f"Error getting usernames from cache: {e}")
            return set()
        finally:
            conn.close()
    
    def save_usernames_to_cache(self, hashtags: List[str], results_limit: int, usernames: Set[str]):
        """Save usernames to the database cache."""
        # First, make sure the cache table exists
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            
            # Create the cache table if it doesn't exist
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS hashtag_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    hashtags TEXT,
                    results_limit INTEGER,
                    username TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(hashtags, results_limit, username)
                )
            ''')
            
            # Convert hashtags to a consistent string format for caching
            hashtags_str = ','.join(sorted(hashtags))
            
            # Begin transaction
            conn.execute('BEGIN TRANSACTION')
            
            # Clear existing entries for these hashtags and limit
            cursor.execute('''
                DELETE FROM hashtag_cache 
                WHERE hashtags = ? AND results_limit = ?
            ''', (hashtags_str, results_limit))
            
            # Insert new entries - use executemany for better performance with large sets
            entries = [(hashtags_str, results_limit, username) for username in usernames]
            cursor.executemany('''
                INSERT INTO hashtag_cache (hashtags, results_limit, username)
                VALUES (?, ?, ?)
            ''', entries)
            
            # Commit the transaction
            conn.commit()
            logger.info(f"Saved {len(usernames)} usernames to cache with limit {results_limit}")
            
        except Exception as e:
            logger.error(f"Error saving usernames to cache: {e}")
            conn.rollback()
        finally:
            conn.close()
            
    def get_cache_statistics(self):
        """Get statistics about the hashtag cache."""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            
            # Get count of unique hashtag+limit combinations (active)
            cursor.execute('''
                SELECT COUNT(DISTINCT hashtags || results_limit) FROM hashtag_cache
                WHERE datetime(created_at) > datetime('now', '-30 minutes')
            ''')
            active_combos = cursor.fetchone()[0]
            
            # Get total count of active cache entries
            cursor.execute('''
                SELECT COUNT(*) FROM hashtag_cache
                WHERE datetime(created_at) > datetime('now', '-30 minutes')
            ''')
            active_entries = cursor.fetchone()[0]
            
            # Get total count of all cache entries (including expired)
            cursor.execute('SELECT COUNT(*) FROM hashtag_cache')
            total_entries = cursor.fetchone()[0]
            
            # Get expired entries count
            expired_entries = total_entries - active_entries
            
            # Get counts per hashtag+limit combination (active only)
            cursor.execute('''
                SELECT hashtags, results_limit, COUNT(*) as count, 
                       MIN(created_at) as oldest, MAX(created_at) as newest
                FROM hashtag_cache
                WHERE datetime(created_at) > datetime('now', '-30 minutes')
                GROUP BY hashtags, results_limit
                ORDER BY count DESC
            ''')
            
            combos = []
            for row in cursor.fetchall():
                combos.append({
                    'hashtags': row[0],
                    'results_limit': row[1],
                    'count': row[2],
                    'oldest': row[3],
                    'newest': row[4]
                })
            
            return {
                'active_combos': active_combos,
                'active_entries': active_entries,
                'expired_entries': expired_entries,
                'total_entries': total_entries,
                'combos': combos
            }
            
        except Exception as e:
            logger.error(f"Error getting cache statistics: {e}")
            return {
                'unique_combos': 0,
                'total_entries': 0,
                'combos': []
            }
        finally:
            conn.close()
    
    def save_influencer(self, username: str, is_influencer: bool, full_name: Optional[str] = None, 
                       bio: Optional[str] = None, email: Optional[str] = None, 
                       checked_influencer: bool = True):
        """
        Save an influencer to the database.
        
        Args:
            username: Instagram username
            is_influencer: Whether the user is an influencer
            full_name: User's full name
            bio: User's bio text
            email: User's email address
            checked_influencer: Whether the user has been checked for being an influencer
                                (defaults to True since we're setting this when we check)
        """
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            
            # Get current timestamp
            now = conn.execute("SELECT datetime('now')").fetchone()[0]
            
            cursor.execute('''
                INSERT OR REPLACE INTO influencers (
                    username, full_name, bio, email, is_influencer, 
                    checked_influencer, checked_influencer_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (username, full_name, bio, email, is_influencer, 
                 checked_influencer, now if checked_influencer else None))
            
            conn.commit()
            
            logger.info(f"Saved influencer {username}: is_influencer={is_influencer}, checked={checked_influencer}")
            
        except Exception as e:
            logger.error(f"Error saving influencer {username}: {e}")
            conn.rollback()
        finally:
            conn.close()
    
    def save_influencers(self, influencers: List[Dict[str, Any]]):
        """Save a list of influencers to the database."""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            for influencer in influencers:
                cursor.execute('''
                    INSERT OR REPLACE INTO influencers (username, full_name, bio, email, is_influencer)
                    VALUES (?, ?, ?, ?, ?)
                ''', (
                    influencer.get('username'),
                    influencer.get('full_name'),
                    influencer.get('bio'),
                    influencer.get('email'),
                    influencer.get('is_influencer', False)
                ))
            conn.commit()
        except Exception as e:
            logger.error(f"Error saving influencers: {e}")
            conn.rollback()
        finally:
            conn.close()
    
    def get_influencers(self, only_with_email: bool = False) -> List[Dict[str, Any]]:
        """Get all influencers from the database."""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            query = '''
                SELECT username, full_name, bio, email, is_influencer
                FROM influencers
                WHERE is_influencer = 1
            '''
            
            if only_with_email:
                query += " AND email IS NOT NULL"
            
            cursor.execute(query)
            
            influencers = []
            for row in cursor.fetchall():
                influencers.append({
                    'username': row[0],
                    'full_name': row[1],
                    'bio': row[2],
                    'email': row[3],
                    'is_influencer': bool(row[4])
                })
            
            return influencers
        except Exception as e:
            logger.error(f"Error getting influencers: {e}")
            return []
        finally:
            conn.close()
    
    def get_usernames_without_profiles(self) -> List[str]:
        """Get usernames that don't have profile information."""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT username FROM influencers
                WHERE full_name IS NULL OR bio IS NULL
            ''')
            
            return [row[0] for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"Error getting usernames without profiles: {e}")
            return []
        finally:
            conn.close()
            
    def get_profiles_by_usernames(self, usernames: List[str]) -> Dict[str, Dict[str, Any]]:
        """Get profiles for specific usernames."""
        if not usernames:
            return {}
            
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            
            # Create a placeholder string with the correct number of placeholders
            placeholders = ','.join(['?' for _ in usernames])
            
            cursor.execute(f'''
                SELECT username, full_name, bio, email, is_influencer, 
                       needs_email_extraction, profile_updated_at, email_extracted_at,
                       checked_influencer, checked_influencer_at
                FROM influencers
                WHERE username IN ({placeholders})
            ''', usernames)
            
            profiles = {}
            for row in cursor.fetchall():
                profiles[row[0]] = {
                    'username': row[0],
                    'full_name': row[1],
                    'bio': row[2],
                    'email': row[3],
                    'is_influencer': bool(row[4]),
                    'needs_email_extraction': bool(row[5]),
                    'profile_updated_at': row[6],
                    'email_extracted_at': row[7],
                    'checked_influencer': bool(row[8]) if row[8] is not None else False,
                    'checked_influencer_at': row[9]
                }
            
            return profiles
        except Exception as e:
            logger.error(f"Error getting profiles by usernames: {e}")
            return {}
        finally:
            conn.close()
    
    def get_usernames_without_emails(self) -> List[str]:
        """Get usernames that don't have emails."""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT username FROM influencers
                WHERE email IS NULL
            ''')
            
            return [row[0] for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"Error getting usernames without emails: {e}")
            return []
        finally:
            conn.close()
    
    def update_user_profiles(self, profiles: Dict[str, Dict[str, Any]]):
        """Update user profiles in the database."""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            
            # Get current timestamp
            now = conn.execute("SELECT datetime('now')").fetchone()[0]
            
            # Track which profiles were updated for return value
            updated_profiles = []
            
            for username, data in profiles.items():
                # First check if the user exists and if bio has changed
                cursor.execute('''
                    SELECT bio FROM influencers WHERE username = ?
                ''', (username,))
                
                result = cursor.fetchone()
                if result:
                    # User exists, check if bio changed
                    current_bio = result[0]
                    new_bio = data.get('bio')
                    
                    # Only mark for email re-extraction if bio changed
                    bio_changed = current_bio != new_bio and new_bio is not None
                    
                    # Update existing user
                    cursor.execute('''
                        UPDATE influencers 
                        SET full_name = ?, 
                            bio = ?,
                            profile_updated_at = ?,
                            needs_email_extraction = ?
                        WHERE username = ?
                    ''', (
                        data.get('full_name'), 
                        new_bio, 
                        now if bio_changed else None,
                        1 if bio_changed else 0,
                        username
                    ))
                    
                    if bio_changed:
                        updated_profiles.append(username)
                else:
                    # Insert new user
                    cursor.execute('''
                        INSERT INTO influencers (
                            username, full_name, bio, is_influencer, 
                            profile_updated_at, needs_email_extraction
                        )
                        VALUES (?, ?, ?, 0, ?, 1)
                    ''', (
                        username, 
                        data.get('full_name'), 
                        data.get('bio'),
                        now
                    ))
                    
                    updated_profiles.append(username)
            
            conn.commit()
            logger.info(f"Updated {len(profiles)} profiles, {len(updated_profiles)} with changed bios")
            return updated_profiles
        except Exception as e:
            logger.error(f"Error updating user profiles: {e}")
            conn.rollback()
            return []
        finally:
            conn.close()
    
    def update_emails(self, email_mapping: Dict[str, str]):
        """Update user emails in the database."""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            
            # Get current timestamp
            now = conn.execute("SELECT datetime('now')").fetchone()[0]
            
            # Track updates for return value
            updated_count = 0
            
            for username, email in email_mapping.items():
                if email:  # Only update if email is not None
                    cursor.execute('''
                        UPDATE influencers 
                        SET email = ?,
                            needs_email_extraction = 0,
                            email_extracted_at = ?
                        WHERE username = ?
                    ''', (email, now, username))
                    
                    updated_count += 1
                else:
                    # If we couldn't find an email, still mark as processed
                    cursor.execute('''
                        UPDATE influencers 
                        SET needs_email_extraction = 0
                        WHERE username = ?
                    ''', (username,))
            
            conn.commit()
            logger.info(f"Updated {updated_count} emails in database")
            return updated_count
        except Exception as e:
            logger.error(f"Error updating emails: {e}")
            conn.rollback()
            return 0
        finally:
            conn.close()
    
    def clean_expired_cache(self):
        """Remove expired cache entries (older than 30 minutes)."""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            
            # Delete entries older than 30 minutes
            cursor.execute('''
                DELETE FROM hashtag_cache 
                WHERE datetime(created_at) <= datetime('now', '-30 minutes')
            ''')
            
            deleted_count = cursor.rowcount
            conn.commit()
            
            if deleted_count > 0:
                logger.info(f"Cleaned up {deleted_count} expired cache entries")
                
            return deleted_count
        except Exception as e:
            logger.error(f"Error cleaning expired cache: {e}")
            conn.rollback()
            return 0
        finally:
            conn.close()