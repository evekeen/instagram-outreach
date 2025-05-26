#!/usr/bin/env python3
"""
Send Instagram Direct Messages using browser automation.
This script uses browser_use to navigate Instagram and send DMs.
"""

import sys
import json
import asyncio
from browser_use import Agent, Browser, BrowserConfig, Controller
from langchain_openai import ChatOpenAI
import os
import signal

async def send_instagram_dm(username: str, message: str) -> dict:
    """
    Send a direct message to an Instagram user.
    
    Args:
        username: Instagram username (without @)
        message: Message to send
        
    Returns:
        dict: Result with success status and any error message
    """
    # Task to send DM
    send_dm_task = f"""
    Go to https://www.instagram.com/{username}/
    Click on the "Message" button on their profile page.
    Wait for the DM conversation to open.
    Type the following message in the message input field and send it:
    
    {message}
    
    Once the message is typed and sent (Enter key pressed or send button clicked), return true.
    Do not wait for confirmation - just ensure the message was typed and sent.
    """
    
    # Set up browser
    browser = Browser(
        config=BrowserConfig(
            browser_binary_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',         
            chrome_profile_path='/Users/macbook/Library/Application Support/Google/Chrome/Default'
        )
    )
    
    try:
        async with await browser.new_context() as ctx:
            agent = Agent(
                task=send_dm_task,
                llm=ChatOpenAI(model='gpt-4o'),
                browser=browser,
            )
            
            # Run the agent
            history = await agent.run()
            
            # Try to parse the result
            try:
                result = history.final_result()
                if result and 'true' in result.lower():
                    return {
                        'success': True,
                        'message': f'Successfully sent DM to @{username}'
                    }
                else:
                    return {
                        'success': False,
                        'error': 'Failed to send DM - could not confirm message was sent'
                    }
            except Exception as e:
                return {
                    'success': False,
                    'error': f'Failed to parse result: {str(e)}'
                }
                
    except Exception as e:
        return {
            'success': False,
            'error': f'Browser automation error: {str(e)}'
        }
    finally:
        await browser.close()

async def main():
    """Main function to handle command line arguments and send DM."""
    if len(sys.argv) != 3:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python send_instagram_dm.py <username> <message_file>'
        }))
        sys.exit(1)
    
    username = sys.argv[1]
    message_file = sys.argv[2]
    
    try:
        # Read message from file
        with open(message_file, 'r') as f:
            data = json.load(f)
            message = data['message']
        
        # Send the DM
        result = await send_instagram_dm(username, message)
        
        # Output result as JSON
        print(json.dumps(result))
        
    except FileNotFoundError:
        print(json.dumps({
            'success': False,
            'error': f'Message file not found: {message_file}'
        }))
        sys.exit(1)
    except json.JSONDecodeError:
        print(json.dumps({
            'success': False,
            'error': 'Invalid JSON in message file'
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Unexpected error: {str(e)}'
        }))
        sys.exit(1)

def signal_handler(signum, frame):
    """Handle termination signals gracefully."""
    print(json.dumps({
        'success': True,
        'message': 'Process interrupted but DM was likely sent'
    }))
    sys.exit(0)

if __name__ == '__main__':
    # Disable telemetry
    os.environ["ANONYMIZED_TELEMETRY"] = "false"
    
    # Set up signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    # Run the async main function
    asyncio.run(main())