# 🎶 How to Set Up Koel on Umbrel

Follow these steps to get Koel running on your Umbrel server:

## 1. Install the App  
Install **Koel**

## 2. Open the Terminal  
Go to:  
`Settings → Advanced Settings → Terminal → App`

## 3. Run the Setup Command  
In the terminal, run the following command:

```bash
php artisan koel:init --no-assets
````

## 4. Choose Your Music Directory

When prompted during the setup, enter the full path to your music folder.  
This is where Koel will scan and manage your audio files.

For example:
- `/music`
- `/downloads/music`

Make sure the folder is accessible by the container and contains supported audio formats like `.mp3`, `.flac`, or `.m4a`.

## 5. Start Using Koel

Once the initialization is complete, you can open Koel in your browser via Umbrel’s interface.

### ✅ Default Login Credentials

Use the following credentials to log in for the first time:

- **Email:** `admin@koel.dev`  
- **Password:** `KoelIsCool`
