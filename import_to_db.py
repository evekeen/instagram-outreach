import sqlite3
import json

def init_db():
    conn = sqlite3.connect('influencers.db')
    with open('schema.sql', 'r') as f:
        conn.executescript(f.read())
    return conn

def import_influencers():
    conn = init_db()
    cursor = conn.cursor()
    
    with open('influencers.json', 'r') as f:
        influencers = json.load(f)
    
    for influencer in influencers:
        cursor.execute('''
            INSERT OR REPLACE INTO influencers (username, full_name, bio, email, is_influencer)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            influencer['username'],
            influencer['full_name'],
            influencer['bio'],
            influencer['email'],
            influencer['is_influencer']
        ))
    
    conn.commit()
    conn.close()

if __name__ == '__main__':
    import_influencers() 