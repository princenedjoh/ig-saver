# IG Saver

A small Chrome extension that adds a download button to Instagram posts, reels and stories. Photos save as **JPG**, videos as **MP4**, straight into your Downloads folder.

## Features

- A button on every post and reel in the feed, on Explore and in the post pop-ups (including posts opened from Messages)
- Carousels: downloads the slide you're looking at, not the whole post
- Stories: photo and video
- Full-resolution files, not the compressed preview Instagram plays
- No accounts, no servers, no tracking. See [PRIVACY.md](PRIVACY.md)

## Install

It isn't on the Chrome Web Store, so load it unpacked:

1. Download or clone this repo
2. Open `chrome://extensions` and turn on **Developer mode**
3. Click **Load unpacked** and pick this folder
4. Open [instagram.com](https://www.instagram.com) while logged in

## How it works

Instagram plays videos from `blob:` URLs, which can't be saved directly. When you click the button, the extension reads the post's shortcode (or the story ID from the URL), asks Instagram's own `/api/v1/media/<id>/info/` endpoint for the media using your existing session, and saves the largest JPG or MP4 with `chrome.downloads`. Nothing leaves your browser except that request to instagram.com.

Buttons float above the page instead of editing Instagram's markup, so a layout change is less likely to break them.

## Limitations

- **Highlights** aren't supported yet. Their URLs don't carry the ID of the item on screen
- Profile pictures, Live and DMs aren't covered
- Instagram can change its private API at any time, which would break downloads until the extension is updated
- You must be logged in. Private accounts only work if you already follow them

## Project layout

| File | Role |
|---|---|
| `manifest.json` | Manifest V3 config |
| `content.js` | Finds posts, places buttons, resolves the media |
| `content.css` | Button and error toast styles |
| `background.js` | Service worker that calls `chrome.downloads` |

## Disclaimer

For saving your own content and media you have permission to keep. Respect creators' rights and [Instagram's terms](https://help.instagram.com/581066165581870). This project is not affiliated with or endorsed by Instagram or Meta.

## License

[MIT](LICENSE)
