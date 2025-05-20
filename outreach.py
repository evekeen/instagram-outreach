from browser_use import Agent, Browser, BrowserConfig, Controller
from langchain_openai import ChatOpenAI
import asyncio
import os
from typing import List
from scraper import HashtagScraper
from pydantic import BaseModel

os.environ["ANONYMIZED_TELEMETRY"] = "false"

# "Navigate to https://www.instagram.com/explore/search/keyword/?q=golfswing, wait for 1 second."

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

async def main():
    usernames = ['piff_golfs', 'selenasamuela']
    print(f'Found {len(usernames)} usernames: {usernames}')
    
    ctrl = Controller(output_model=Influencer)
    
    for username in usernames:
        print(f'Processing {username}')
        browser = Browser(
            config=BrowserConfig(
                browser_binary_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',         
                chrome_profile_path='/Users/macbook/Library/Application Support/Google/Chrome/Default'
            )
        )
        async with await browser.new_context() as ctx:
            agent = Agent(
                task=get_view_count.format(username=username),
                llm=ChatOpenAI(model='gpt-4o'),
                browser=browser,
                controller=ctrl,
            )
            history = await agent.run()
            data = Influencer.model_validate_json(history.final_result())
            print(f'{username} - {data}')
            await ctx.close()
            await browser.close()

        # delay for 5 seconds
        await asyncio.sleep(5)

    input('Press Enter to close the browser...')
    await browser.close()

if __name__ == '__main__':
    asyncio.run(main())