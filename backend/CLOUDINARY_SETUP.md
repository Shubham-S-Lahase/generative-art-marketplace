# Cloudinary Integration Setup Guide

## What You Need from Cloudinary

To use Cloudinary for image storage, you need the following credentials from your Cloudinary account:

1. **Cloud Name** - Your Cloudinary cloud name
2. **API Key** - Your Cloudinary API key  
3. **API Secret** - Your Cloudinary API secret

## How to Get Your Cloudinary Credentials

1. **Sign up/Login** to [Cloudinary](https://cloudinary.com)
2. **Go to Dashboard** - After logging in, you'll see your dashboard
3. **Find Your Credentials** - They are displayed on the dashboard:
   - **Cloud Name**: Usually shown at the top (e.g., `dxyz123abc`)
   - **API Key**: Found in the "Account Details" section
   - **API Secret**: Found in the "Account Details" section (click "Reveal" to see it)

## Setup Instructions

### Step 1: Add Credentials to `.env` File

Edit your `backend/.env` file and add:

```env
# Cloudinary Configuration
USE_CLOUDINARY=true
CLOUDINARY_CLOUD_NAME=your-cloud-name-here
CLOUDINARY_API_KEY=your-api-key-here
CLOUDINARY_API_SECRET=your-api-secret-here
```

**Important:** Replace the placeholder values with your actual Cloudinary credentials!

### Step 2: Restart Backend Server

After updating the `.env` file, restart your backend server:

```cmd
cd backend
go run cmd/main.go
```

You should see:
- `Cloudinary initialized successfully` - if Cloudinary is enabled and credentials are valid
- `Using local file storage` - if `USE_CLOUDINARY=false` or credentials are missing

## How It Works

- **When `USE_CLOUDINARY=true`**: 
  - Images are uploaded to Cloudinary cloud storage
  - Images are served via Cloudinary CDN (faster, scalable)
  - No local `uploads/` folder needed
  
- **When `USE_CLOUDINARY=false`**:
  - Images are saved to local `uploads/` folder
  - Images are served via local static file server
  - Works offline, but not scalable

## Benefits of Cloudinary

✅ **Scalable** - No disk space limits  
✅ **Fast CDN** - Images load faster globally  
✅ **Automatic optimization** - Images are optimized automatically  
✅ **Transformations** - Can resize/transform images on-the-fly  
✅ **Backup** - Images are backed up in the cloud  

## Troubleshooting

**Error: "Cloudinary is enabled but credentials are missing"**
- Make sure all three environment variables are set in `.env`
- Check for typos in variable names

**Error: "failed to initialize Cloudinary"**
- Verify your credentials are correct
- Check your Cloudinary account is active
- Ensure you have internet connection

**Images not loading after switching to Cloudinary**
- Old images in MongoDB still have `/uploads/...` paths
- New images will have Cloudinary URLs
- You can migrate old images or keep using local storage for existing ones

