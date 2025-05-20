import os
import logging
from typing import Dict, List, Any, Optional
from apify_client import ApifyClient
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

class ApifyHelper:
    """Helper class for interacting with Apify API."""
    
    def __init__(self):
        self.token = os.getenv("APIFY_TOKEN")
        if not self.token:
            raise ValueError("APIFY_TOKEN environment variable is not set")
        
        self.client = ApifyClient(token=self.token)
        self.hashtag_scraper_id = "apify/instagram-hashtag-scraper"
        self.post_scraper_id = "apify/instagram-post-scraper"
        self.profile_scraper_id = "apify/instagram-profile-scraper"
        self.proxy_config = {
            "useApifyProxy": True,
            "apifyProxyGroups": ["RESIDENTIAL"]
        }
    
    async def scrape_hashtags(self, hashtags: List[str], results_limit: int) -> List[Dict[str, Any]]:
        """Scrape posts from Instagram hashtags."""
        # If we have a very large limit, we need to be careful not to overload the API
        # Limit maximum results per hashtag to avoid timeouts or excessive costs
        max_results_per_hashtag = 500
        
        # Calculate results per hashtag, with a safety maximum
        results_per_hashtag = min(max_results_per_hashtag, max(1, results_limit // len(hashtags)))
        logger.info(f"Scraping {len(hashtags)} hashtags with {results_per_hashtag} results per hashtag (requested total: {results_limit})")

        input_data = {
            "hashtags": hashtags,
            "resultsLimit": results_per_hashtag,
            "proxy": self.proxy_config
        }

        try:
            # Run the actor and wait for it to finish
            run = self.client.actor(self.hashtag_scraper_id).call(run_input=input_data)
            
            # Fetch and return the actor run's dataset items
            dataset_items = self.client.dataset(run["defaultDatasetId"]).list_items().items
            logger.info(f"Scraped {len(dataset_items)} posts from hashtags")
            return dataset_items
        except Exception as e:
            logger.error(f"Error scraping hashtags: {e}")
            return []
    
    async def scrape_user_posts(self, username: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Scrape posts from an Instagram user."""
        logger.info(f"Scraping posts for user: {username}")
        
        input_data = {
            "username": [username],
            "resultsLimit": limit,
            "proxy": self.proxy_config
        }
        
        try:
            # Run the actor and wait for it to finish
            run = self.client.actor(self.post_scraper_id).call(run_input=input_data)
            
            # Fetch and return the actor run's dataset items
            dataset_items = self.client.dataset(run["defaultDatasetId"]).list_items().items
            logger.info(f"Scraped {len(dataset_items)} posts for {username}")
            return dataset_items
        except Exception as e:
            logger.error(f"Error scraping posts for {username}: {e}")
            return []
    
    async def scrape_user_profile(self, username: str) -> Optional[Dict[str, Any]]:
        """Scrape profile information for an Instagram user."""
        logger.info(f"Scraping profile for user: {username}")
        
        input_data = {
            "username": [username],
            "resultsType": "details",
            "proxy": self.proxy_config
        }
        
        try:
            # Run the actor and wait for it to finish
            run = self.client.actor(self.profile_scraper_id).call(run_input=input_data)
            
            # Fetch the actor run's dataset items
            dataset_items = self.client.dataset(run["defaultDatasetId"]).list_items().items
            
            if dataset_items:
                logger.info(f"Successfully scraped profile for {username}")
                return dataset_items[0]
            else:
                logger.warning(f"No profile data found for {username}")
                return None
        except Exception as e:
            logger.error(f"Error scraping profile for {username}: {e}")
            return None