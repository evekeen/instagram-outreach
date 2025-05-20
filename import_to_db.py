import sqlite3
import json
import argparse
import os
from db_helper import DatabaseHelper

def init_db():
    """Initialize the database with the schema."""
    db = DatabaseHelper()
    print("Database initialized with schema.")
    return db

def import_from_json(json_file):
    """Import influencers from a JSON file into the database."""
    if not os.path.exists(json_file):
        print(f"Error: File '{json_file}' does not exist.")
        return
        
    db = DatabaseHelper()
    
    try:
        with open(json_file, 'r') as f:
            influencers = json.load(f)
        
        print(f"Found {len(influencers)} influencers in the JSON file.")
        db.save_influencers(influencers)
        print(f"Successfully imported {len(influencers)} influencers into the database.")
    except Exception as e:
        print(f"Error importing from JSON: {e}")

def export_to_json(json_file, only_with_email=False):
    """Export influencers from the database to a JSON file."""
    db = DatabaseHelper()
    influencers = db.get_influencers(only_with_email)
    
    try:
        with open(json_file, 'w') as f:
            json.dump(influencers, f, indent=2)
        print(f"Successfully exported {len(influencers)} influencers to '{json_file}'.")
    except Exception as e:
        print(f"Error exporting to JSON: {e}")

def list_influencers(only_with_email=False):
    """List all influencers in the database."""
    db = DatabaseHelper()
    influencers = db.get_influencers(only_with_email)
    
    if not influencers:
        print("No influencers found in the database.")
        return
        
    print(f"Found {len(influencers)} influencers in the database:")
    for i, influencer in enumerate(influencers, 1):
        email_status = "✓" if influencer.get('email') else "✗"
        print(f"{i}. {influencer['username']} - {influencer.get('full_name', 'n/a')} - Email: {email_status}")
    
    # Print summary stats
    with_email = sum(1 for inf in influencers if inf.get('email'))
    print(f"\nSummary: {len(influencers)} total, {with_email} with email, {len(influencers) - with_email} without email")

def main():
    parser = argparse.ArgumentParser(description="Database utility for influencer management")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Init command
    init_parser = subparsers.add_parser("init", help="Initialize database")
    
    # Import command
    import_parser = subparsers.add_parser("import", help="Import influencers from JSON")
    import_parser.add_argument("file", help="JSON file to import from")
    
    # Export command
    export_parser = subparsers.add_parser("export", help="Export influencers to JSON")
    export_parser.add_argument("file", help="JSON file to export to")
    export_parser.add_argument("--email-only", action="store_true", help="Export only influencers with email")
    
    # List command
    list_parser = subparsers.add_parser("list", help="List influencers in database")
    list_parser.add_argument("--email-only", action="store_true", help="List only influencers with email")
    
    args = parser.parse_args()
    
    if args.command == "init":
        init_db()
    elif args.command == "import":
        import_from_json(args.file)
    elif args.command == "export":
        export_to_json(args.file, args.email_only)
    elif args.command == "list":
        list_influencers(args.email_only)
    else:
        parser.print_help()

if __name__ == '__main__':
    main()