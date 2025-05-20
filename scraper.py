import os
import logging
import json
from typing import List, Dict, Any, Set
from pathlib import Path
from dotenv import load_dotenv

from client import ApifyHelper

load_dotenv()
logger = logging.getLogger(__name__)

CACHE_FILE = "username_cache.json"

class HashtagScraper:
    """Scrape Instagram hashtags to find potential influencers."""
    
    def __init__(self):
        self.apify = ApifyHelper()
        self.hashtags = os.getenv("HASHTAGS", "golf,golfswing").split(",")
        self.results_limit = int(os.getenv("RESULTS_LIMIT", "100"))
    
    def _load_cache(self) -> Dict[str, Any]:
        if Path(CACHE_FILE).exists():
            with open(CACHE_FILE, 'r') as f:
                return json.load(f)
        return {"hashtags": [], "results_limit": 0, "usernames": []}
    
    def _save_cache(self, usernames: Set[str]):
        cache_data = {
            "hashtags": self.hashtags,
            "results_limit": self.results_limit,
            "usernames": list(usernames)
        }
        with open(CACHE_FILE, 'w') as f:
            json.dump(cache_data, f)
    
    async def get_usernames_from_hashtags(self) -> Set[str]:
        """
        Scrape hashtags and extract unique usernames of content creators.
        """
        cache = self._load_cache()
        if (cache["hashtags"] == self.hashtags and 
            cache["results_limit"] == self.results_limit and 
            cache["usernames"]):
            logger.info("Using cached usernames")
            return set(cache["usernames"])
        
        posts = await self.apify.scrape_hashtags(self.hashtags, self.results_limit)
        
        # Extract unique usernames from posts
        usernames = set()
        for post in posts:
            username = post.get("ownerUsername")
            if username:
                usernames.add(username)
        
        logger.info(f"Found {len(usernames)} unique users from {len(posts)} posts")
        self._save_cache(usernames)
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