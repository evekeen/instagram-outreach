#!/usr/bin/env python3

import sqlite3
import logging
import sys

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def add_columns_if_missing(db_path="influencers.db", auto_mark_processed=True):
    """Add new columns to the database if they don't exist."""
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check existing columns
        cursor.execute("PRAGMA table_info(influencers)")
        columns = {col[1] for col in cursor.fetchall()}
        logger.info(f"Found {len(columns)} existing columns in influencers table")
        
        # Columns to add and their definitions
        new_columns = {
            "profile_updated_at": "TIMESTAMP",
            "needs_email_extraction": "BOOLEAN DEFAULT FALSE",
            "email_extracted_at": "TIMESTAMP"
        }
        
        # Add missing columns
        added_columns = False
        for col_name, col_def in new_columns.items():
            if col_name not in columns:
                logger.info(f"Adding column: {col_name} {col_def}")
                cursor.execute(f"ALTER TABLE influencers ADD COLUMN {col_name} {col_def}")
                added_columns = True
            else:
                logger.info(f"Column {col_name} already exists, skipping")
        
        # Commit changes
        conn.commit()
        
        if added_columns:
            logger.info("Migration completed successfully")
        else:
            logger.info("No columns needed to be added")
        
        # Mark all existing profiles as processed
        if auto_mark_processed:
            cursor.execute("""
                UPDATE influencers
                SET needs_email_extraction = 0
                WHERE needs_email_extraction IS NULL OR email IS NOT NULL
            """)
            conn.commit()
            logger.info("Marked all existing profiles as processed")
        
    except Exception as e:
        logger.error(f"Error during migration: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Add missing columns to the database")
    parser.add_argument("--db", default="influencers.db", help="Path to the database file")
    parser.add_argument("--no-auto-mark", dest="auto_mark", action="store_false", 
                      help="Don't automatically mark existing profiles as processed")
    
    args = parser.parse_args()
    add_columns_if_missing(args.db, args.auto_mark)