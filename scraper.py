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
    
    async def get_usernames_from_hashtags(self) -> Set[str]:
        """
        Scrape hashtags and extract unique usernames of content creators.
        """
        # Clean expired cache entries periodically (only on first call)
        if not hasattr(self, '_cache_cleaned'):
            self.db.clean_expired_cache()
            self._cache_cleaned = True
            
        # Check if we have cached usernames in the database
        cached_usernames = self.db.get_usernames_from_cache(self.hashtags, self.results_limit)
        if cached_usernames:
            logger.info(f"Using {len(cached_usernames)} cached usernames from database (limit: {self.results_limit})")
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