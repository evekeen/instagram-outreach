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
    profiles = {}
            
    try:
        # The client.py already accepts an array of usernames
        # We just need to pass the batch directly
        input_data = {
            "usernames": usernames,
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
        
        for username in usernames:
            if username not in profiles:
                profiles[username] = {
                    'full_name': None,
                    'bio': None
                }
                print(f'No profile data found for {username}')
    
    except Exception as e:
        print(f"Error fetching profiles for batch: {e}")
        for username in usernames:
            if username not in profiles:
                profiles[username] = {
                    'full_name': None,
                    'bio': None
                }        
    
    return profiles

async def extract_emails_from_bios(profiles: Dict[str, Dict[str, Any]]) -> Dict[str, str]:
    """Use ChatGPT to extract emails from user bios."""
    client = OpenAI()
    
    # Prepare data for the batch request to ChatGPT
    profiles_with_bio = {username: data for username, data in profiles.items() 
                         if data.get('bio')}
    
    if not profiles_with_bio:
        print("No profiles with bio found")
        return {}
    
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
        
        # Convert to username -> email mapping
        email_mapping = {}
        for item in mapping.profiles:
            username = item.username
            email = item.email
            if username:
                email_mapping[username] = email
        
        print(f"Found {len([e for e in email_mapping.values() if e])} emails from {len(email_mapping)} bios")
        return email_mapping
    
    except Exception as e:
        print(f"Error extracting emails with ChatGPT: {e}")
        return {}

async def main():
    usernames = ['piff_golfs', 'selenasamuela']
    print(f'Found {len(usernames)} usernames: {usernames}')
    
    user_profiles = await get_user_profiles(usernames)
    
    emails = await extract_emails_from_bios(user_profiles)
    print(f'emails: {emails}')
    
    for username, email in emails.items():
        if username in user_profiles:
            user_profiles[username]['email'] = email
    
    with open('user_profiles.json', 'w') as f:
        json.dump(user_profiles, f, indent=2)
    
    ctrl = Controller(output_model=Influencer)
    influencers = []
    
    filtered_usernames = [username for username in usernames if user_profiles.get(username, {}).get('email')]
    print(f'Processing {len(filtered_usernames)} usernames with emails: {filtered_usernames}')
    
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
                if data.is_influencer:
                    influencers.append(data)
                
                await ctx.close()
        except Exception as e:
            print(f"Error processing {username}: {e}")
        finally:
            await browser.close()

        # delay for 5 seconds
        await asyncio.sleep(5)
    
    # Save influencers to a file
    with open('influencers.json', 'w') as f:
        json.dump([i.model_dump() for i in influencers], f, indent=2)
    
    print(f"Found {len(influencers)} influencers. Results saved to 'influencers.json'")

if __name__ == '__main__':
    asyncio.run(main())