import os
import logging
from typing import List, Dict, Any, Set, Optional
from dotenv import load_dotenv

from client import ApifyHelper
from db_helper import DatabaseHelper

load_dotenv()
logger = logging.getLogger(__name__)

class HashtagScraper:
    """Scrape Instagram hashtags to find potential influencers."""
    
    def __init__(self):
        self.apify = ApifyHelper()
        self.db = DatabaseHelper()
        self.hashtags = os.getenv("HASHTAGS", "golf,golfswing").split(",")
        self.results_limit = int(os.getenv("RESULTS_LIMIT", "100"))
    
    async def get_usernames_from_hashtags(self, max_retries: int = 3, initial_limit: Optional[int] = None) -> Set[str]:
        """
        Scrape hashtags and extract unique usernames of content creators.
        
        Args:
            max_retries: Maximum number of retries with increased limits
            initial_limit: Initial results limit (defaults to self.results_limit if None)
        """
        current_limit = initial_limit or self.results_limit
        original_limit = self.results_limit
        retry_count = 0
        all_usernames_in_db = False
        
        while retry_count < max_retries:
            # Temporarily set the results limit
            self.results_limit = current_limit
            
            # Check if we have cached usernames in the database
            cached_usernames = self.db.get_usernames_from_cache(self.hashtags, self.results_limit)
            if cached_usernames:
                logger.info(f"Using {len(cached_usernames)} cached usernames from database (limit: {self.results_limit})")
                
                # Check if all usernames are already in the DB by checking profiles
                existing_profiles = self.db.get_profiles_by_usernames(list(cached_usernames))
                if len(existing_profiles) == len(cached_usernames) and retry_count < max_retries - 1:
                    all_usernames_in_db = True
                    logger.info(f"All {len(cached_usernames)} usernames already have profiles in DB")
                    
                    # Double the limit and try again
                    current_limit *= 2
                    logger.info(f"Increasing results limit to {current_limit} and retrying")
                    retry_count += 1
                    continue
                
                # Reset the results limit to the original value before returning
                self.results_limit = original_limit
                return cached_usernames
            
            logger.info(f"Fetching usernames with limit: {self.results_limit}")
            posts = await self.apify.scrape_hashtags(self.hashtags, self.results_limit)
            
            # Extract unique usernames from posts
            usernames = set()
            for post in posts:
                username = post.get("ownerUsername")
                if username:
                    usernames.add(username)
            
            logger.info(f"Found {len(usernames)} unique users from {len(posts)} posts")
            
            # Save usernames to database cache
            self.db.save_usernames_to_cache(self.hashtags, self.results_limit, usernames)
            
            # Check if all usernames are already in the DB by checking profiles
            if retry_count < max_retries - 1:
                existing_profiles = self.db.get_profiles_by_usernames(list(usernames))
                if len(existing_profiles) == len(usernames):
                    all_usernames_in_db = True
                    logger.info(f"All {len(usernames)} usernames already have profiles in DB")
                    
                    # Double the limit and try again
                    current_limit *= 2
                    logger.info(f"Increasing results limit to {current_limit} and retrying")
                    retry_count += 1
                    continue
            
            # Reset the results limit to the original value before returning
            self.results_limit = original_limit
            return usernames
            
        # If we've reached the maximum number of retries, return the last set of usernames
        logger.info(f"Reached maximum retries ({max_retries}) with limit {current_limit}")
        
        # Reset the results limit to the original value before returning
        self.results_limit = original_limit
        return usernames
    
    def extract_hashtags_from_caption(self, caption: str) -> List[str]:
        """Extract hashtags from a post caption."""
        if not caption:
            return []
            
        # Simple regex-like approach to extract hashtags
        hashtags = []
        for word in caption.split():
            if word.startswith("#"):
                # Remove the # and any trailing punctuation
                tag = word[1:].lower().rstrip(",.!?;:")
                if tag:
                    hashtags.append(tag)
        
        return hashtags
    
    def is_video_post(self, post: Dict[str, Any]) -> bool:
        """Determine if a post is a video/reel."""
        return (
            post.get("type") == "Video" or 
            (post.get("type") == "Sidecar" and post.get("videoCount", 0) > 0)
        )