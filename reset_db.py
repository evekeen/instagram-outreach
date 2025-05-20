#!/usr/bin/env python3
"""
Script to reset the database by deleting all data from tables.
This keeps the tables but removes all rows.
"""

import sqlite3
import os
import sys
import argparse
from pathlib import Path

def reset_database(db_path: str = 'influencers.db', confirm: bool = False):
    """
    Reset the database by clearing all tables but keeping the schema.
    
    Args:
        db_path: Path to the SQLite database file
        confirm: If False, will ask for confirmation before proceeding
    
    Returns:
        True if reset was successful, False otherwise
    """
    if not os.path.exists(db_path):
        print(f"Database file '{db_path}' does not exist.")
        return False
    
    if not confirm:
        response = input(f"Are you sure you want to delete ALL DATA from '{db_path}'? This cannot be undone. (y/N): ")
        if response.lower() not in ['y', 'yes']:
            print("Operation cancelled.")
            return False
    
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get a list of all tables in the database
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        # Count the total number of rows to delete
        total_rows = 0
        table_counts = {}
        
        for table in tables:
            table_name = table[0]
            if table_name != 'sqlite_sequence':  # Skip SQLite's internal table
                cursor.execute(f"SELECT COUNT(*) FROM {table_name};")
                count = cursor.fetchone()[0]
                total_rows += count
                table_counts[table_name] = count
        
        print(f"Found {len(table_counts)} tables with {total_rows} total rows:")
        for table_name, count in table_counts.items():
            print(f"  - {table_name}: {count} rows")
        
        if total_rows == 0:
            print("Database is already empty.")
            return True
        
        # Begin transaction
        cursor.execute("BEGIN TRANSACTION;")
        
        # Delete data from each table
        for table in tables:
            table_name = table[0]
            if table_name != 'sqlite_sequence':  # Skip SQLite's internal table
                cursor.execute(f"DELETE FROM {table_name};")
                print(f"Cleared table '{table_name}'")
                
                # Reset auto-increment counters
                cursor.execute(f"DELETE FROM sqlite_sequence WHERE name='{table_name}';")
        
        # Commit transaction
        conn.commit()
        print(f"Successfully deleted all data from {len(table_counts)} tables ({total_rows} rows).")
        
        # Vacuum the database to reclaim space
        conn.execute("VACUUM;")
        print("Database vacuumed to reclaim space.")
        
        return True
    
    except sqlite3.Error as e:
        print(f"SQLite error: {e}")
        if conn:
            conn.rollback()
        return False
    
    except Exception as e:
        print(f"Error: {e}")
        if conn:
            conn.rollback()
        return False
    
    finally:
        if conn:
            conn.close()

def main():
    parser = argparse.ArgumentParser(description='Reset database by deleting all data from tables.')
    parser.add_argument('--db', dest='db_path', default='influencers.db', 
                        help='Path to the SQLite database file (default: influencers.db)')
    parser.add_argument('--force', '-f', dest='force', action='store_true',
                        help='Force reset without confirmation prompt')
    
    args = parser.parse_args()
    
    success = reset_database(args.db_path, args.force)
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())