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
        """Get usernames from the database cache."""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            
            # Convert hashtags to a consistent string format for caching
            hashtags_str = ','.join(sorted(hashtags))
            
            # Check if we have cached usernames for these hashtags and limit
            cursor.execute('''
                SELECT username FROM hashtag_cache 
                WHERE hashtags = ? AND results_limit = ?
            ''', (hashtags_str, results_limit))
            
            usernames = set(row[0] for row in cursor.fetchall())
            
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
                    UNIQUE(hashtags, results_limit, username)
                )
            ''')
            
            # Convert hashtags to a consistent string format for caching
            hashtags_str = ','.join(sorted(hashtags))
            
            # Clear existing entries for these hashtags and limit
            cursor.execute('''
                DELETE FROM hashtag_cache 
                WHERE hashtags = ? AND results_limit = ?
            ''', (hashtags_str, results_limit))
            
            # Insert new entries
            for username in usernames:
                cursor.execute('''
                    INSERT INTO hashtag_cache (hashtags, results_limit, username)
                    VALUES (?, ?, ?)
                ''', (hashtags_str, results_limit, username))
            
            conn.commit()
        except Exception as e:
            logger.error(f"Error saving usernames to cache: {e}")
            conn.rollback()
        finally:
            conn.close()
    
    def save_influencer(self, username: str, is_influencer: bool, full_name: Optional[str] = None, 
                       bio: Optional[str] = None, email: Optional[str] = None):
        """Save an influencer to the database."""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO influencers (username, full_name, bio, email, is_influencer)
                VALUES (?, ?, ?, ?, ?)
            ''', (username, full_name, bio, email, is_influencer))
            conn.commit()
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
                SELECT username, full_name, bio, email, is_influencer 
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
                    'is_influencer': bool(row[4])
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
            for username, data in profiles.items():
                # First check if the user exists
                cursor.execute('''
                    SELECT 1 FROM influencers WHERE username = ?
                ''', (username,))
                
                if cursor.fetchone():
                    # Update existing user
                    cursor.execute('''
                        UPDATE influencers 
                        SET full_name = ?, bio = ?
                        WHERE username = ?
                    ''', (data.get('full_name'), data.get('bio'), username))
                else:
                    # Insert new user
                    cursor.execute('''
                        INSERT INTO influencers (username, full_name, bio, is_influencer)
                        VALUES (?, ?, ?, 0)
                    ''', (username, data.get('full_name'), data.get('bio')))
            
            conn.commit()
        except Exception as e:
            logger.error(f"Error updating user profiles: {e}")
            conn.rollback()
        finally:
            conn.close()
    
    def update_emails(self, email_mapping: Dict[str, str]):
        """Update user emails in the database."""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            for username, email in email_mapping.items():
                if email:  # Only update if email is not None
                    cursor.execute('''
                        UPDATE influencers 
                        SET email = ?
                        WHERE username = ?
                    ''', (email, username))
            
            conn.commit()
        except Exception as e:
            logger.error(f"Error updating emails: {e}")
            conn.rollback()
        finally:
            conn.close()