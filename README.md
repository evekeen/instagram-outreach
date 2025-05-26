# Instagram Influencer Outreach Tool

*Author: Alexander Ivkin*  
**https://ivkin.dev**  
**https://www.linkedin.com/in/evekeen/**  
**https://github.com/evekeen**  

## 🎯 Overview

An AI-powered tool for discovering Instagram influencers, extracting their contact information, generating personalized outreach emails, and managing affiliate program communications. Perfect for businesses looking to scale their influencer marketing efforts.

## ✨ Features

- **🔍 Instagram Discovery**: Automatically searches Instagram hashtags to find relevant content creators
- **📧 Email Extraction**: Uses AI to extract email addresses from Instagram bios
- **🤖 AI Email Generation**: Creates personalized outreach emails using GPT-4
- **📬 Email Sending**: Integrates with Gmail for direct email delivery
- **📊 Progress Tracking**: Real-time monitoring of the discovery process
- **💾 Database Management**: Persistent storage with SQLite
- **🎛️ Filter Options**: Filter by email availability and influencer status

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React 18, Chakra UI
- **Backend**: Node.js API routes, SQLite database
- **AI**: OpenAI GPT-4 for email generation and bio analysis
- **Automation**: Browser automation with Playwright/Puppeteer
- **Email**: Nodemailer with Gmail integration

## 📋 Prerequisites

1. **Node.js** (version 16+)
2. **Python 3.8+** with required packages
3. **Google Chrome** browser (for Instagram automation)
4. **OpenAI API key**
5. **Gmail app password** (for sending emails)
6. **Apify account** (for Instagram scraping)

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository
git clone <repository-url>
cd marketing-outreach

# Install Node.js dependencies
npm install

# Install Python dependencies
pip install browser-use langchain-openai asyncio pydantic openai sqlite3
```

### 2. Environment Configuration

Create a `.env.local` file in the root directory:

```env
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Gmail Configuration for sending emails
GMAIL_USER=your_gmail_address@gmail.com
GMAIL_APP_PASSWORD=your_gmail_app_password

# Apify Configuration (for Instagram scraping)
APIFY_API_TOKEN=your_apify_token_here
```

### 3. Gmail Setup

1. Enable 2-factor authentication on your Gmail account
2. Generate an app password: [Google App Passwords](https://myaccount.google.com/apppasswords)
3. Use this app password in your `.env.local` file

### 4. Chrome Profile Setup

Update the Chrome profile path in `outreach.py` (line 390):

```python
chrome_profile_path='/path/to/your/chrome/profile'
```

Find your Chrome profile path:
- **macOS**: `~/Library/Application Support/Google/Chrome/Default`
- **Windows**: `%USERPROFILE%\AppData\Local\Google\Chrome\User Data\Default`
- **Linux**: `~/.config/google-chrome/default`

### 5. Database Setup

The database will be created automatically on first run. If you need to reset:

```bash
python reset_db.py
```

## 🎮 How to Use

### 1. Start the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Find New Influencers

1. Click **"Find New Influencers"** button
2. The process will automatically:
   - Search Instagram hashtags for relevant posts
   - Extract usernames of content creators
   - Fetch profile information (name, bio)
   - Extract email addresses from bios using AI
   - Verify influencer status by checking reel view counts
3. Monitor progress in real-time
4. Process runs in background - you can close the modal and return later

### 3. Generate Personalized Emails

1. View the discovered influencers in the main table
2. Filter by "Only with Email" and "Only Influencers" as needed
3. Click **"Generate Email"** for any influencer
4. AI will create a personalized email based on their bio and content
5. Review and edit the generated email if needed
6. Click **"Save Draft"** to store your changes

### 4. Send Outreach Emails

1. Review the generated email draft
2. Make any final edits
3. Click **"Send Email"** to deliver via Gmail
4. Track sent status in the main table
5. Resend or edit emails as needed

### 5. Manage Your Database

- **Filter Options**: Use checkboxes to filter by email availability and influencer status
- **Reset Database**: Use the "Reset Database" button to clear all data
- **View Progress**: Monitor discovery process in real-time

## 📊 Understanding the Process

### Discovery Workflow

1. **Hashtag Search**: Searches relevant Instagram hashtags
2. **Username Extraction**: Collects usernames from posts
3. **Profile Fetching**: Gets full profile data via Apify
4. **Email Extraction**: AI analyzes bios for contact information
5. **Influencer Verification**: Checks reel view counts to confirm influencer status

### Email Generation

The AI considers:
- Influencer's bio and content style
- Personalized messaging based on their niche
- Your affiliate program details (15% revenue share, free app access)
- Professional tone with clear call-to-action

## 🔧 Configuration

### Customizing Search Parameters

Edit `scraper.py` to modify:
- Target hashtags
- Search limits
- Geographic targeting

### Email Template Customization

Modify the prompt in `app/api/generate-email/route.ts` (line 46) to:
- Change your product/service details
- Adjust commission rates
- Modify email tone and style

### Influencer Criteria

Adjust influencer verification in `outreach.py` (line 33):
- Change minimum view count thresholds
- Modify verification logic
- Add additional criteria


## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## 📄 License

MIT

This project is for educational and business use. Please respect Instagram's terms of service and applicable privacy laws when using this tool.

---

### Let's build businesses together and have fun 🙂