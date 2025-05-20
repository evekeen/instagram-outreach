import sys
from browser_use import Agent, Browser, BrowserConfig, Controller
from langchain_openai import ChatOpenAI
import asyncio
import os
import json
import re
import time
from typing import List, Dict, Any, Optional
from scraper import HashtagScraper
from pydantic import BaseModel
from client import ApifyHelper
from openai import OpenAI
from db_helper import DatabaseHelper
import progress_monitor

os.environ["ANONYMIZED_TELEMETRY"] = "false"

# Get the progress monitor
monitor = progress_monitor.get_monitor("outreach")

# Progress reporting function
def progress_update(stage, message, data=None):
    """Update progress using the monitor instead of print statements."""
    # Update the progress file with structured data
    monitor.update_progress(stage, message, data=data)
    
    # Check if we should stop
    if monitor.should_stop():
        monitor.log(f"Received stop command during stage: {stage}", "warning")
        sys.exit(0)

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
    progress_update("hashtags", "Fetching usernames from hashtags...")
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
    progress_update("profiles", f"Found {len(loaded_profiles)} existing profiles in database", 
                   {"total": len(usernames), "existing": len(loaded_profiles)})
    
    # Add loaded profiles to our results
    for username, profile_data in loaded_profiles.items():
        if profile_data.get('full_name') and profile_data.get('bio'):
            profiles[username] = profile_data
            progress_update("profile_detail", f"Using existing profile for {username}", 
                           {"username": username, "from_cache": True})
    
    # Create list of usernames we still need to fetch
    usernames_to_fetch = [username for username in usernames if username not in profiles]
    
    if not usernames_to_fetch:
        progress_update("profiles", "All profiles already in database, no need to call Apify")
        return profiles
        
    progress_update("profiles", f"Fetching {len(usernames_to_fetch)} new profiles from Apify", 
                   {"to_fetch": len(usernames_to_fetch)})
    
    try:
        # The client.py already accepts an array of usernames
        # We just need to pass the batch directly
        input_data = {
            "usernames": usernames_to_fetch,
            "resultsType": "details",
            "proxy": apify.proxy_config
        }
        
        progress_update("apify", "Starting Apify profile scraping job...")
        run = apify.client.actor(apify.profile_scraper_id).call(run_input=input_data)
        progress_update("apify", "Fetching results from Apify dataset...")
        dataset_items = apify.client.dataset(run["defaultDatasetId"]).list_items().items
        
        for profile_data in dataset_items:
            username = profile_data.get('username')
            if username:
                profiles[username] = {
                    'full_name': profile_data.get('fullName'),
                    'bio': profile_data.get('biography')
                }
                progress_update("profile_detail", f"Got profile for {username}", 
                              {"username": username, "from_cache": False})
        
        for username in usernames_to_fetch:
            if username not in profiles:
                profiles[username] = {
                    'full_name': None,
                    'bio': None
                }
                progress_update("profile_detail", f"No profile data found for {username}", 
                              {"username": username, "error": True})
    
    except Exception as e:
        progress_update("error", f"Error fetching profiles for batch: {e}", {"error": str(e)})
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
        progress_update("profiles", f"Saved {len(new_profiles)} new user profiles to database", 
                       {"saved_count": len(new_profiles)})
    
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
            progress_update("email_detail", f"Using existing email for {username}: {profile.get('email')}", 
                          {"username": username, "email": profile.get('email'), "from_cache": True})
        elif username in profiles and profiles[username].get('bio'):
            # Add to processing list if:
            # - It needs email extraction (bio changed or new profile)
            # - Or it doesn't have an email yet
            # - And it has a bio to extract from
            usernames_to_process.append(username)
    
    progress_update("emails", f"Found {len(email_mapping)} existing emails in database that don't need re-extraction", 
                   {"existing_emails": len(email_mapping)})
    progress_update("emails", f"Need to process {len(usernames_to_process)} bios for email extraction", 
                   {"to_process": len(usernames_to_process)})
    
    if not usernames_to_process:
        return email_mapping
    
    # Prepare data for the batch request to ChatGPT
    profiles_to_process = {username: profiles[username] for username in usernames_to_process}
    profiles_with_bio = {username: data for username, data in profiles_to_process.items() 
                         if data.get('bio')}
    
    if not profiles_with_bio:
        progress_update("emails", "No profiles with bio found for email extraction")
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
        progress_update("openai", "Sending bios to ChatGPT for email extraction...", 
                       {"bio_count": len(bio_data)})
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
                progress_update("email_detail", f"Found email for {username}: {email}", 
                              {"username": username, "email": email, "from_ai": True})
        
        # Add all processed usernames (even those without emails) to mark them as processed
        no_email_usernames = processed_usernames - set(new_emails.keys())
        for username in no_email_usernames:
            new_emails[username] = None
            progress_update("email_detail", f"No email found for {username}", 
                          {"username": username, "from_ai": True})
        
        email_count = len([e for e in new_emails.values() if e])
        progress_update("emails", f"Found {email_count} new emails from {len(bio_data)} bios", 
                       {"new_emails": email_count, "processed_bios": len(bio_data)})
        
        # Save results to database and reset flags
        if new_emails:
            updated = db.update_emails(new_emails)
            progress_update("emails", f"Saved {updated} new emails to database, marked {len(new_emails)} profiles as processed", 
                           {"updated_count": updated, "processed_count": len(new_emails)})
        
        return email_mapping
    
    except Exception as e:
        progress_update("error", f"Error extracting emails with ChatGPT: {e}", {"error": str(e)})
        return email_mapping

async def main():
    progress_update("start", "Starting outreach process...", {"percent": 5})
    db = DatabaseHelper()
    max_retry_attempts = 3
    current_attempt = 0
    initial_limit = None
    
    while current_attempt < max_retry_attempts:
        # Get usernames from hashtags - 5-20% of progress
        # If all usernames are already in the DB, the scraper will automatically increase the results limit and retry
        progress_update("hashtags", f"Getting usernames from hashtags (attempt {current_attempt+1}/{max_retry_attempts})", 
                        {"attempt": current_attempt+1, "max_attempts": max_retry_attempts, "percent": 10})
        scraper = HashtagScraper()
        usernames = await scraper.get_usernames_from_hashtags(max_retries=3, initial_limit=initial_limit)
        usernames = list(usernames)
        
        # For testing - limit the number of usernames
        original_count = len(usernames)
        test_mode = False
        if test_mode and original_count > 10:
            progress_update("hashtags", f"Testing mode: Limiting to 10 usernames out of {original_count}", 
                           {"original_count": original_count, "limited_count": 10, "test_mode": True, "percent": 15})
            usernames = usernames[:10]
        
        progress_update("hashtags", f"Found {len(usernames)} usernames", 
                       {"username_count": len(usernames), "usernames": usernames, "percent": 20})
        
        # Get user profiles - 20-40% of progress
        progress_update("profiles", "Fetching user profiles...", {"username_count": len(usernames), "percent": 25})
        user_profiles = await get_user_profiles(usernames)
        progress_update("profiles", f"Fetched {len(user_profiles)} user profiles", 
                       {"profile_count": len(user_profiles), "percent": 40})
        
        # Extract emails - 40-60% of progress
        progress_update("emails", "Extracting emails from user bios...", {"profile_count": len(user_profiles), "percent": 45})
        emails = await extract_emails_from_bios(user_profiles)
        email_count = len([e for e in emails.values() if e])
        progress_update("emails", f"Found {email_count} emails out of {len(usernames)} usernames", 
                       {"email_count": email_count, "username_count": len(usernames), "percent": 55})
        
        # Filter usernames to only process those with emails
        filtered_usernames = [username for username in usernames if emails.get(username)]
        progress_update("emails", f"Found {len(filtered_usernames)} usernames with email", 
                       {"filtered_count": len(filtered_usernames), "percent": 60})
        
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
            
            progress_update("retry", f"No emails found. Attempt {current_attempt}/{max_retry_attempts}: Increasing result limit to {initial_limit}",
                           {"attempt": current_attempt, "max_attempts": max_retry_attempts, "new_limit": initial_limit})
            
            # Reset progress for next attempt
            progress_update("hashtags", "Retrying with increased limit...", {"percent": 10})
            continue
        
        # If we found emails or reached the maximum number of retries, break the loop
        break
    
    # Update the user_profiles dictionary with emails
    for username, email in emails.items():
        if username in user_profiles:
            user_profiles[username]['email'] = email
    
    # Browser automation - 60-95% of progress
    # Set up the controller for the browser automation
    ctrl = Controller(output_model=Influencer)
    
    # We already calculated filtered_usernames above
    progress_update("browser", f"Processing {len(filtered_usernames)} usernames with emails", 
                   {"username_count": len(filtered_usernames), "usernames": filtered_usernames, "percent": 60})
    
    # Calculate progress increments for each username
    progress_per_username = 0
    if filtered_usernames:
        progress_per_username = 35 / len(filtered_usernames)  # 35% of progress (60-95%) divided by number of usernames
    
    # Process each username
    for i, username in enumerate(filtered_usernames):
        # Calculate current progress based on completed usernames
        current_progress = 60 + (i * progress_per_username)
        
        progress_update("browser", f"Processing {username} ({i+1}/{len(filtered_usernames)})", 
                       {"username": username, "current": i+1, "total": len(filtered_usernames), 
                        "percent": current_progress})
        browser = Browser(
            config=BrowserConfig(
                browser_binary_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',         
                chrome_profile_path='/Users/macbook/Library/Application Support/Google/Chrome/Default'
            )
        )
        try:
            async with await browser.new_context() as ctx:
                progress_update("browser_detail", f"Launching browser for {username}...", 
                              {"username": username, "percent": current_progress})
                agent = Agent(
                    task=get_view_count.format(username=username),
                    llm=ChatOpenAI(model='gpt-4o'),
                    browser=browser,
                    controller=ctrl,
                )
                progress_update("browser_detail", f"Running agent to check if {username} is an influencer...", 
                              {"username": username, "percent": current_progress + (progress_per_username * 0.3)})
                history = await agent.run()
                data = Influencer.model_validate_json(history.final_result())
                
                # Add bio, full name, and email to the influencer object
                profile_data = user_profiles.get(username, {})
                data.full_name = profile_data.get('full_name')
                data.bio = profile_data.get('bio')
                data.email = profile_data.get('email')
                
                progress_update("browser_detail", f"{username} - is_influencer: {data.is_influencer}", 
                              {"username": username, "is_influencer": data.is_influencer, 
                               "percent": current_progress + (progress_per_username * 0.6)})
                
                # Save the influencer data to the database
                db.save_influencer(
                    username=data.username,
                    is_influencer=data.is_influencer,
                    full_name=data.full_name,
                    bio=data.bio,
                    email=data.email
                )
                progress_update("browser_detail", f"Saved {username} data to database", 
                              {"username": username, "percent": current_progress + (progress_per_username * 0.8)})
                
                await ctx.close()
        except Exception as e:
            progress_update("error", f"Error processing {username}: {e}", 
                          {"username": username, "error": str(e), "percent": current_progress + progress_per_username})
        finally:
            await browser.close()

        # delay for 5 seconds
        progress_update("browser_detail", f"Waiting 5 seconds before the next profile...", 
                      {"username": username, "percent": current_progress + progress_per_username})
        await asyncio.sleep(5)
    
    # Get all influencers from the database
    influencers = db.get_influencers()
    progress_update("complete", f"Process completed. Found {len(influencers)} influencers in the database", 
                   {"influencer_count": len(influencers), "percent": 100})

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
            progress_update("warning", "Your database is missing required columns for efficient email extraction. " +
                           "Please run 'python migrate_add_columns.py' to update your database schema.", 
                           {"missing_columns": ["needs_email_extraction"]})
            return False
            
        return True
    except Exception as e:
        progress_update("error", f"Error checking database columns: {e}", {"error": str(e)})
        return False
    finally:
        if 'conn' in locals():
            conn.close()

async def run_with_monitoring():
    """Run the main function with proper monitoring and error handling."""
    try:
        monitor.log(f"Python version: {sys.version}")
        monitor.log(f"Current directory: {os.getcwd()}")
        monitor.log(f"Files in current directory: {os.listdir('.')}")
        
        # Send an initial progress update
        progress_update("start", "Outreach process is initializing...", {"python_version": sys.version})
        
        # Check if the database needs migration
        check_db_columns()
        
        # Run the main function
        progress_update("start", "Starting main outreach process...")
        await main()
        
        # Mark as complete
        monitor.mark_complete("Outreach process completed successfully")
        
    except KeyboardInterrupt:
        monitor.log("Process was interrupted by user", "warning")
        monitor.mark_failed("Process was interrupted by user")
        
    except Exception as e:
        error_message = f"Error in outreach process: {str(e)}"
        monitor.log(error_message, "error")
        monitor.mark_failed(error_message)
        import traceback
        monitor.log(traceback.format_exc(), "error")
        raise

if __name__ == '__main__':
    # Initialize control file to "run"
    with open("outreach_control.json", 'w') as f:
        json.dump({"command": "run", "timestamp": time.time()}, f)
    
    # Run the main function with monitoring
    asyncio.run(run_with_monitoring())