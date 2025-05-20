import sys
from browser_use import Agent, Browser, BrowserConfig, Controller
from langchain_openai import ChatOpenAI
import asyncio
import os
import json
import re
from typing import List, Dict, Any, Optional
from scraper import HashtagScraper
from pydantic import BaseModel
from client import ApifyHelper
from openai import OpenAI
from db_helper import DatabaseHelper

os.environ["ANONYMIZED_TELEMETRY"] = "false"

get_view_count = (    
    "Open the {username} user reels with a URL like this https://www.instagram.com/{username}/reels/ "
    "Check if the is a tab Reels exactlybetween Posts and Tagged. Make sure Reels is the tab in the center of the page, not a menu item on the left. "
    "If no Reels tab, skip this user, return false immediately. "
    "You will see a list of reels at the bottom of the page. Do not open them."
    "Skip 3 first reels, and see if out of the next 6 reels at least 4 have more than 3000 views. To do that you just read the text overlay on top of each reel card."
    "If they do have more than 3000 views, we will mark this user as an influencer and add them to the list of influencers. "
    "Return true or false"
)

async def get_usernames() -> List[str]:
    scraper = HashtagScraper()
    usernames = await scraper.get_usernames_from_hashtags()
    return sorted(list(usernames))

class Influencer(BaseModel):
    username: str
    is_influencer: bool
    full_name: Optional[str] = None
    bio: Optional[str] = None
    email: Optional[str] = None
    
class UserEmail(BaseModel):
    username: str
    email: str
    
class EmailMapping(BaseModel):
    profiles: List[UserEmail]

async def get_user_profiles(usernames: List[str]) -> Dict[str, Dict[str, Any]]:
    """Fetch profile information including bio and full name for each username."""
    apify = ApifyHelper()
    db = DatabaseHelper()
    profiles = {}
    
    # Check which usernames we already have complete profile information for
    loaded_profiles = db.get_profiles_by_usernames(usernames)
    print(f"Found {len(loaded_profiles)} existing profiles in database")
    
    # Add loaded profiles to our results
    for username, profile_data in loaded_profiles.items():
        if profile_data.get('full_name') and profile_data.get('bio'):
            profiles[username] = profile_data
            print(f"Using existing profile for {username}")
    
    # Create list of usernames we still need to fetch
    usernames_to_fetch = [username for username in usernames if username not in profiles]
    
    if not usernames_to_fetch:
        print("All profiles already in database, no need to call Apify")
        return profiles
        
    print(f"Fetching {len(usernames_to_fetch)} new profiles from Apify")
    
    try:
        # The client.py already accepts an array of usernames
        # We just need to pass the batch directly
        input_data = {
            "usernames": usernames_to_fetch,
            "resultsType": "details",
            "proxy": apify.proxy_config
        }
        
        run = apify.client.actor(apify.profile_scraper_id).call(run_input=input_data)
        dataset_items = apify.client.dataset(run["defaultDatasetId"]).list_items().items
        
        for profile_data in dataset_items:
            username = profile_data.get('username')
            if username:
                profiles[username] = {
                    'full_name': profile_data.get('fullName'),
                    'bio': profile_data.get('biography')
                }
                print(f'Got profile for {username}: {profiles[username]}')
        
        for username in usernames_to_fetch:
            if username not in profiles:
                profiles[username] = {
                    'full_name': None,
                    'bio': None
                }
                print(f'No profile data found for {username}')
    
    except Exception as e:
        print(f"Error fetching profiles for batch: {e}")
        for username in usernames_to_fetch:
            if username not in profiles:
                profiles[username] = {
                    'full_name': None,
                    'bio': None
                }        
    
    # Save new profiles to database
    new_profiles = {username: data for username, data in profiles.items() 
                   if username in usernames_to_fetch}
    
    if new_profiles:
        db.update_user_profiles(new_profiles)
        print(f"Saved {len(new_profiles)} new user profiles to database")
    
    return profiles

async def extract_emails_from_bios(profiles: Dict[str, Dict[str, Any]]) -> Dict[str, str]:
    """Use ChatGPT to extract emails from user bios."""
    client = OpenAI()
    db = DatabaseHelper()
    
    # First, check which profiles already have emails in the database
    usernames = list(profiles.keys())
    existing_profiles = db.get_profiles_by_usernames(usernames)
    
    # Initialize the email mapping with existing emails
    email_mapping = {}
    usernames_to_process = []
    
    for username, profile in existing_profiles.items():
        # Check if profile needs email extraction - handle None values for safety
        needs_extraction = profile.get('needs_email_extraction')
        if needs_extraction is None:
            needs_extraction = True  # Default to processing if field is missing
            
        if profile.get('email') and not needs_extraction:
            # If we already have an email and don't need re-extraction, use it
            email_mapping[username] = profile.get('email')
            print(f"Using existing email for {username}: {profile.get('email')}")
        elif username in profiles and profiles[username].get('bio'):
            # Add to processing list if:
            # - It needs email extraction (bio changed or new profile)
            # - Or it doesn't have an email yet
            # - And it has a bio to extract from
            usernames_to_process.append(username)
    
    print(f"Found {len(email_mapping)} existing emails in database that don't need re-extraction")
    print(f"Need to process {len(usernames_to_process)} bios for email extraction")
    
    if not usernames_to_process:
        return email_mapping
    
    # Prepare data for the batch request to ChatGPT
    profiles_to_process = {username: profiles[username] for username in usernames_to_process}
    profiles_with_bio = {username: data for username, data in profiles_to_process.items() 
                         if data.get('bio')}
    
    if not profiles_with_bio:
        print("No profiles with bio found for email extraction")
        return email_mapping
    
    # Prepare the structured data for ChatGPT
    bio_data = []
    for username, data in profiles_with_bio.items():
        bio_data.append({"username": username, "bio": data.get('bio', '')})
    
    # Create the system prompt for structured output
    system_prompt = (
        "You are a helpful assistant that extracts email addresses from Instagram bios. "  
        "For each bio, determine if there is an email address present. "  
        "Return a JSON array of objects with 'username' and 'email' fields. "  
        "If no email is found, set the email field to null. Be thorough and check for "  
        "different email formats and obfuscation techniques like 'at' instead of '@' or 'dot' instead of '.'. "  
        "Only return valid email addresses."
    )
    
    # Create the user prompt with the bio data
    user_prompt = (f"Extract email addresses from these Instagram bios: {json.dumps(bio_data)}\n"  
                 f"Format your response as a JSON array of objects with 'username' and 'email' fields.")
    
    try:
        print("Sending bios to ChatGPT for email extraction...")
        response = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            response_format=EmailMapping,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )
        
        content = response.choices[0].message.content
        mapping = EmailMapping.model_validate_json(content)
        
        # Process the results
        new_emails = {}
        processed_usernames = set()
        
        for item in mapping.profiles:
            username = item.username
            email = item.email
            processed_usernames.add(username)
            
            if username and email:
                email_mapping[username] = email
                new_emails[username] = email
        
        # Add all processed usernames (even those without emails) to mark them as processed
        no_email_usernames = processed_usernames - set(new_emails.keys())
        for username in no_email_usernames:
            new_emails[username] = None
        
        email_count = len([e for e in new_emails.values() if e])
        print(f"Found {email_count} new emails from {len(bio_data)} bios")
        
        # Save results to database and reset flags
        if new_emails:
            updated = db.update_emails(new_emails)
            print(f"Saved {updated} new emails to database, marked {len(new_emails)} profiles as processed")
        
        return email_mapping
    
    except Exception as e:
        print(f"Error extracting emails with ChatGPT: {e}")
        return email_mapping

async def main():
    db = DatabaseHelper()
    max_retry_attempts = 3
    current_attempt = 0
    initial_limit = None
    
    while current_attempt < max_retry_attempts:
        # Get usernames from hashtags
        # If all usernames are already in the DB, the scraper will automatically increase the results limit and retry
        scraper = HashtagScraper()
        usernames = await scraper.get_usernames_from_hashtags(max_retries=3, initial_limit=initial_limit)
        usernames = list(usernames)
        
        # For testing - limit the number of usernames
        original_count = len(usernames)
        test_mode = False
        if test_mode and original_count > 10:
            print(f"Testing mode: Limiting to 10 usernames out of {original_count}")
            usernames = usernames[:10]
        print(f'Found {len(usernames)} usernames: {usernames}')
        
        # Get user profiles
        user_profiles = await get_user_profiles(usernames)
        
        # Extract emails
        emails = await extract_emails_from_bios(user_profiles)
        email_count = len([e for e in emails.values() if e])
        print(f'Found {email_count} emails out of {len(usernames)} usernames')
        
        # Filter usernames to only process those with emails
        filtered_usernames = [username for username in usernames if emails.get(username)]
        print(f'Found {len(filtered_usernames)} usernames with email')
        
        # If no emails were found or no usernames with emails were found,
        # and we haven't reached the maximum number of retries, increase the result limit and try again
        if (email_count == 0 or len(filtered_usernames) == 0) and current_attempt < max_retry_attempts - 1:
            current_attempt += 1
            
            # Determine the new limit - either double or add 50, whichever is lower
            current_limit = initial_limit or scraper.results_limit
            increase_by_double = current_limit * 2
            increase_by_50 = current_limit + 50
            
            # Use the smaller increase
            initial_limit = min(increase_by_double, increase_by_50)
            
            print(f"No emails found. Attempt {current_attempt}/{max_retry_attempts}: " 
                  f"Increasing result limit to {initial_limit} and trying again.")
            continue
        
        # If we found emails or reached the maximum number of retries, break the loop
        break
    
    # Update the user_profiles dictionary with emails
    for username, email in emails.items():
        if username in user_profiles:
            user_profiles[username]['email'] = email
    
    # Set up the controller for the browser automation
    ctrl = Controller(output_model=Influencer)
    
    # We already calculated filtered_usernames above
    print(f'Processing {len(filtered_usernames)} usernames with emails: {filtered_usernames}')
    
    # Process each username
    for username in filtered_usernames:
        print(f'Processing {username}')
        browser = Browser(
            config=BrowserConfig(
                browser_binary_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',         
                chrome_profile_path='/Users/macbook/Library/Application Support/Google/Chrome/Default'
            )
        )
        try:
            async with await browser.new_context() as ctx:
                agent = Agent(
                    task=get_view_count.format(username=username),
                    llm=ChatOpenAI(model='gpt-4o'),
                    browser=browser,
                    controller=ctrl,
                )
                history = await agent.run()
                data = Influencer.model_validate_json(history.final_result())
                
                # Add bio, full name, and email to the influencer object
                profile_data = user_profiles.get(username, {})
                data.full_name = profile_data.get('full_name')
                data.bio = profile_data.get('bio')
                data.email = profile_data.get('email')
                
                print(f'{username} - {data}')
                
                # Save the influencer data to the database
                db.save_influencer(
                    username=data.username,
                    is_influencer=data.is_influencer,
                    full_name=data.full_name,
                    bio=data.bio,
                    email=data.email
                )
                
                await ctx.close()
        except Exception as e:
            print(f"Error processing {username}: {e}")
        finally:
            await browser.close()

        # delay for 5 seconds
        await asyncio.sleep(5)
    
    # Get all influencers from the database
    influencers = db.get_influencers()
    print(f"Found {len(influencers)} influencers in the database")

# Check if the database needs migration before running
def check_db_columns():
    """Check if the database has the required columns and prompt for migration if needed."""
    try:
        # Try to import the necessary modules
        import sqlite3
        
        # Connect to the database
        conn = sqlite3.connect('influencers.db')
        cursor = conn.cursor()
        
        # Check if the needs_email_extraction column exists
        cursor.execute("PRAGMA table_info(influencers)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'needs_email_extraction' not in columns:
            print("=" * 80)
            print("WARNING: Your database is missing required columns for efficient email extraction.")
            print("Please run 'python migrate_add_columns.py' to update your database schema.")
            print("=" * 80)
            return False
            
        return True
    except Exception as e:
        print(f"Error checking database columns: {e}")
        return False
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == '__main__':
    # Check if the database needs migration
    check_db_columns()
    
    # Run the main function
    asyncio.run(main())