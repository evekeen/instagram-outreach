#!/usr/bin/env python3
"""
Migration script to add checked_influencer and checked_influencer_at columns to influencers table.
"""

import sqlite3
import os
import sys
import time
from pathlib import Path

def add_influencer_check_columns(db_path="influencers.db"):
    """
    Add checked_influencer and checked_influencer_at columns to influencers table
    if they don't already exist.
    
    Args:
        db_path: Path to the SQLite database file
    """
    if not os.path.exists(db_path):
        print(f"Database file '{db_path}' does not exist.")
        return False
    
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(influencers)")
        columns = [col[1] for col in cursor.fetchall()]
        
        # Add checked_influencer column if it doesn't exist
        if 'checked_influencer' not in columns:
            print("Adding checked_influencer column...")
            cursor.execute("ALTER TABLE influencers ADD COLUMN checked_influencer BOOLEAN DEFAULT FALSE")
            
            # Set checked_influencer to TRUE for any entry that already has is_influencer set
            # Since these have clearly been checked before
            cursor.execute("""
                UPDATE influencers
                SET checked_influencer = TRUE
                WHERE is_influencer = TRUE OR is_influencer = 1
            """)
            
            print("- Added checked_influencer column")
            print(f"- Set checked_influencer to TRUE for {cursor.rowcount} influencers with is_influencer=TRUE")
        else:
            print("checked_influencer column already exists.")
        
        # Add checked_influencer_at column if it doesn't exist
        if 'checked_influencer_at' not in columns:
            print("Adding checked_influencer_at column...")
            cursor.execute("ALTER TABLE influencers ADD COLUMN checked_influencer_at TIMESTAMP")
            
            # Set timestamp for existing influencers that were checked
            now = time.strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute("""
                UPDATE influencers
                SET checked_influencer_at = ?
                WHERE checked_influencer = TRUE OR checked_influencer = 1
            """, (now,))
            
            print("- Added checked_influencer_at column")
            print(f"- Set current timestamp for {cursor.rowcount} influencers")
        else:
            print("checked_influencer_at column already exists.")
        
        conn.commit()
        print("Migration completed successfully.")
        return True
    
    except sqlite3.Error as e:
        print(f"SQLite error: {e}")
        if conn:
            conn.rollback()
        return False
    
    finally:
        if conn:
            conn.close()

def main():
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    else:
        db_path = "influencers.db"
    
    print(f"Migrating database: {db_path}")
    add_influencer_check_columns(db_path)

if __name__ == "__main__":
    main()