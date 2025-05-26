#!/usr/bin/env python3
"""
Migration to add Instagram DM tracking columns to the database.
"""

import sqlite3
import sys

def migrate():
    """Add Instagram DM tracking columns to the influencers table."""
    try:
        conn = sqlite3.connect('influencers.db')
        cursor = conn.cursor()
        
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(influencers)")
        columns = [col[1] for col in cursor.fetchall()]
        
        columns_to_add = []
        
        if 'dm_sent' not in columns:
            columns_to_add.append("ALTER TABLE influencers ADD COLUMN dm_sent BOOLEAN DEFAULT FALSE")
            
        if 'dm_sent_at' not in columns:
            columns_to_add.append("ALTER TABLE influencers ADD COLUMN dm_sent_at TIMESTAMP")
            
        if 'dm_message' not in columns:
            columns_to_add.append("ALTER TABLE influencers ADD COLUMN dm_message TEXT")
        
        if columns_to_add:
            print(f"Adding {len(columns_to_add)} new columns for DM tracking...")
            for sql in columns_to_add:
                cursor.execute(sql)
                print(f"  ✓ {sql}")
            
            conn.commit()
            print("Migration completed successfully!")
        else:
            print("All DM tracking columns already exist. No migration needed.")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"Error during migration: {e}")
        return False

if __name__ == '__main__':
    success = migrate()
    sys.exit(0 if success else 1)