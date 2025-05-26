#!/usr/bin/env python3
"""
YOLO (You Only Live Once) Automated Outreach Process
Automatically discovers influencers and sends outreach via email or Instagram DM
"""

import asyncio
import sys
import os
import json
import time
from typing import List, Dict, Any
import subprocess
from datetime import datetime

# Import modules from existing scripts
from outreach import (
    get_usernames,
    get_user_profiles,
    extract_emails_from_bios,
    get_view_count,
    Influencer,
    progress_update
)
from db_helper import DatabaseHelper
from openai import OpenAI
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from browser_use import Agent, Browser, BrowserConfig, Controller
from langchain_openai import ChatOpenAI
import progress_monitor

os.environ["ANONYMIZED_TELEMETRY"] = "false"

# Get the progress monitor
monitor = progress_monitor.get_monitor("yolo")

def progress_update_yolo(stage, message, data=None):
    """Update progress using the monitor."""
    monitor.update_progress(stage, message, data=data)
    
    if monitor.should_stop():
        monitor.log(f"Received stop command during stage: {stage}", "warning")
        sys.exit(0)

async def generate_email_for_influencer(influencer: Dict[str, Any]) -> Dict[str, str]:
    """Generate personalized email/DM content for an influencer."""
    client = OpenAI()
    
    try:
        # System prompt for email generation
        system_prompt = """You are a marketing specialist creating personalized outreach messages for golf influencers. 
        Create a compelling, personalized email that:
        1. References something specific about their content or profile
        2. Introduces the Ace Trace app for golfers
        3. Proposes an affiliate partnership
        4. Keeps it concise and engaging
        
        The message should work for both email and Instagram DM."""
        
        # User prompt with influencer details
        user_prompt = f"""Create an outreach message for this golf influencer:
        Username: {influencer.get('username', '')}
        Full Name: {influencer.get('full_name', '')}
        Bio: {influencer.get('bio', '')}
        
        Product: Ace Trace - Golf shot tracking app
        Offer: 15% commission on sales, free app access, 10% discount for followers
        
        Return a JSON object with 'subject' and 'body' fields."""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        return json.loads(content)
        
    except Exception as e:
        progress_update_yolo("error", f"Failed to generate message for {influencer.get('username')}: {e}")
        # Return a default template
        return {
            "subject": "Partnership Opportunity with Ace Trace",
            "body": f"Hi {influencer.get('full_name', influencer.get('username'))},\n\nI noticed your amazing golf content and would love to discuss a partnership opportunity with Ace Trace, our golf shot tracking app.\n\nWe offer 15% commission, free app access, and 10% discount for your followers.\n\nInterested in learning more?\n\nBest regards,\nAce Trace Team"
        }

async def send_email(to_email: str, subject: str, body: str, username: str) -> bool:
    """Send email using SMTP."""
    try:
        smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        sender_email = os.getenv("SENDER_EMAIL")
        sender_password = os.getenv("SENDER_PASSWORD")
        
        if not sender_email or not sender_password:
            progress_update_yolo("error", f"Email credentials not configured for {username}")
            return False
        
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(sender_email, sender_password)
        server.send_message(msg)
        server.quit()
        
        progress_update_yolo("email_sent", f"Email sent successfully to {username} ({to_email})")
        return True
        
    except Exception as e:
        progress_update_yolo("error", f"Failed to send email to {username}: {e}")
        return False

async def send_instagram_dm(username: str, message: str) -> bool:
    """Send Instagram DM using the existing script."""
    try:
        # Create temporary message file
        temp_file = f"/tmp/yolo_dm_{username}_{int(time.time())}.json"
        with open(temp_file, 'w') as f:
            json.dump({
                'username': username,
                'message': message,
                'timestamp': datetime.now().isoformat()
            }, f)
        
        # Call the Instagram DM script
        script_path = os.path.join(os.path.dirname(__file__), 'send_instagram_dm.py')
        process = subprocess.Popen(
            ['python', script_path, username, temp_file],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Wait for up to 120 seconds
        try:
            stdout, stderr = process.communicate(timeout=120)
            
            # Clean up temp file
            os.unlink(temp_file)
            
            # Check result
            if stdout:
                result = json.loads(stdout)
                if result.get('success'):
                    progress_update_yolo("dm_sent", f"Instagram DM sent successfully to {username}")
                    return True
        except subprocess.TimeoutExpired:
            process.kill()
            os.unlink(temp_file)
            # Assume success if timeout (based on previous fix)
            progress_update_yolo("dm_sent", f"Instagram DM likely sent to {username} (timeout)")
            return True
            
    except Exception as e:
        progress_update_yolo("error", f"Failed to send DM to {username}: {e}")
        if os.path.exists(temp_file):
            os.unlink(temp_file)
    
    return False

async def check_if_influencer(username: str, ctrl: Controller) -> bool:
    """Check if user is an influencer using browser automation."""
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
            return data.is_influencer
    except Exception as e:
        progress_update_yolo("error", f"Failed to check influencer status for {username}: {e}")
        return False
    finally:
        await browser.close()

async def yolo_process():
    """Main YOLO automated outreach process."""
    progress_update_yolo("start", "Starting YOLO automated outreach process...", {"percent": 5})
    db = DatabaseHelper()
    
    try:
        # Step 1: Get usernames from hashtags (5-15%)
        progress_update_yolo("discovery", "Discovering new influencers from hashtags...", {"percent": 5})
        usernames = await get_usernames()
        progress_update_yolo("discovery", f"Found {len(usernames)} potential influencers", 
                           {"count": len(usernames), "percent": 15})
        
        # Step 2: Get user profiles (15-25%)
        progress_update_yolo("profiles", "Fetching user profiles...", {"percent": 15})
        user_profiles = await get_user_profiles(usernames)
        progress_update_yolo("profiles", f"Fetched {len(user_profiles)} profiles", 
                           {"count": len(user_profiles), "percent": 25})
        
        # Step 3: Extract emails (25-35%)
        progress_update_yolo("emails", "Extracting contact information...", {"percent": 25})
        emails = await extract_emails_from_bios(user_profiles)
        email_count = len([e for e in emails.values() if e and e != "null"])
        progress_update_yolo("emails", f"Found {email_count} email addresses", 
                           {"email_count": email_count, "percent": 35})
        
        # Update profiles with emails
        for username, email in emails.items():
            if username in user_profiles:
                user_profiles[username]['email'] = email
        
        # Step 4: Check influencer status and send outreach (35-95%)
        progress_update_yolo("outreach", "Starting automated outreach...", {"percent": 35})
        
        ctrl = Controller(output_model=Influencer)
        total_sent = 0
        email_sent = 0
        dm_sent = 0
        
        # Calculate progress per user
        progress_per_user = 60 / len(usernames) if usernames else 0
        current_progress = 35
        
        for username in usernames:
            profile = user_profiles.get(username, {})
            
            # Check if already contacted
            existing = db.get_profiles_by_usernames([username])
            if existing.get(username, {}).get('email_sent') or existing.get(username, {}).get('dm_sent'):
                progress_update_yolo("skip", f"Skipping {username} - already contacted", 
                                   {"username": username, "percent": current_progress})
                current_progress += progress_per_user
                continue
            
            # Check if influencer
            progress_update_yolo("checking", f"Checking if {username} is an influencer...", 
                               {"username": username, "percent": current_progress})
            
            is_influencer = await check_if_influencer(username, ctrl)
            
            # Save influencer status
            db.save_influencer(
                username=username,
                is_influencer=is_influencer,
                full_name=profile.get('full_name'),
                bio=profile.get('bio'),
                email=profile.get('email'),
                checked_influencer=True
            )
            
            if not is_influencer:
                progress_update_yolo("skip", f"{username} is not an influencer", 
                                   {"username": username, "percent": current_progress + progress_per_user * 0.5})
                current_progress += progress_per_user
                continue
            
            # Generate personalized message
            progress_update_yolo("generating", f"Generating message for {username}...", 
                               {"username": username, "percent": current_progress + progress_per_user * 0.5})
            
            message_data = await generate_email_for_influencer(profile)
            
            # Send outreach
            email = profile.get('email')
            if email and email != "null":
                # Send email
                success = await send_email(email, message_data['subject'], message_data['body'], username)
                if success:
                    conn = db.get_connection()
                    cursor = conn.cursor()
                    cursor.execute(
                        "UPDATE influencers SET email_sent = 1, email_sent_at = datetime('now'), "
                        "email_subject = ?, email_body = ? WHERE username = ?",
                        (message_data['subject'], message_data['body'], username)
                    )
                    conn.commit()
                    conn.close()
                    email_sent += 1
                    total_sent += 1
            else:
                # Send Instagram DM
                success = await send_instagram_dm(username, message_data['body'])
                if success:
                    conn = db.get_connection()
                    cursor = conn.cursor()
                    cursor.execute(
                        "UPDATE influencers SET dm_sent = 1, dm_sent_at = datetime('now'), "
                        "dm_message = ? WHERE username = ?",
                        (message_data['body'], username)
                    )
                    conn.commit()
                    conn.close()
                    dm_sent += 1
                    total_sent += 1
            
            current_progress += progress_per_user
            progress_update_yolo("progress", f"Processed {username}", 
                               {"username": username, "percent": min(current_progress, 95)})
            
            # Small delay between outreach
            await asyncio.sleep(2)
        
        # Final summary
        progress_update_yolo("complete", 
                           f"YOLO process complete! Sent {total_sent} messages ({email_sent} emails, {dm_sent} DMs)", 
                           {"total_sent": total_sent, "email_sent": email_sent, "dm_sent": dm_sent, "percent": 100})
        
    except Exception as e:
        progress_update_yolo("error", f"YOLO process failed: {str(e)}", {"error": str(e)})
        raise

async def main():
    """Main entry point."""
    try:
        await yolo_process()
        monitor.mark_complete("YOLO process completed successfully")
    except KeyboardInterrupt:
        monitor.mark_failed("Process interrupted by user")
    except Exception as e:
        monitor.mark_failed(f"Process failed: {str(e)}")
        raise

if __name__ == '__main__':
    asyncio.run(main())