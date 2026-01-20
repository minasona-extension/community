# Minasona Twitch Icons

See cute Minawan not only in the stream but in the chat as well!

This extension displays the Minasona of a Minawan as a badge right next to their username in Twitch chat. It's a neat addon to the chat and helps people get to know everyone's Minasonas better.

Settings:
- Location: Choose to show icons only in Cerber's chat or enable them globally across all of Twitch.
- Defaults: Toggle "standard" Minasonas on or off for those who don't have a custom one yet.
- Size: Use the slider to make the chat icons smaller or larger.

## Out Now

### Chrome v1.3
https://chromewebstore.google.com/detail/minasona-twitch-icons/paoappdblefbmihfcjbmcebhdgabfkib

### Edge v1.3
https://microsoftedge.microsoft.com/addons/detail/minasona-twitch-icons/annkpdgajokhpgdncdcfjmadjpafbecp

### Opera v1.3
[Download from chrome store](https://chromewebstore.google.com/detail/minasona-twitch-icons/paoappdblefbmihfcjbmcebhdgabfkib)

### Firefox v1.3
https://addons.mozilla.org/de/firefox/addon/minasona-twitch-icons/

## Changelog

### 1.4 (in development)
- Supports Palsonas from multiple communities
  - The display of a Palsona for a user happens using the following priorities:
  1. Minawan
  2. Currently watched channel Palsona
  3. Other channel Palsonas...
  4. Default Minasona (if checked in the settings)

### 1.3
- You can now **set your own Minasona** on the website: https://minawan.me/ Login with Discord and make sure you have your Twitch account linked. Thanks Hoopywan!
- More robust username detection
  - hopefully pronouns extension and FFZ should work Prayge
- **VOD** support (enable 'Show Minasonas in other Chats')
- Larger onclick images

### 1.2
- Firefox support

### 1.1
- wan wan
- removed unused image in order to pass store requirements checks

### 1.0

- Extension working for chromium based browsers

## Docs

### Building the extension

1. Install dependencies:
```console
cd extension
npm install
```

2. Build the extension (chromium):
```console
node build.js chrome
```
### or
2. Build the extension (firefox):
```console
node build.js firefox
```

3. You can find the files for the extension inside the `dist` folder.

### Structure of the project

- `background.ts` is the background script of the extension. It is used to fetch the user list from the API and store it in the local browser storage.
- `content.ts` is the frontend script. It can interact with the web page and is used to read the usernames in the chat and create and insert the corresponding icons.
- `popup.html` / `popup.js` is the popup displayed when opening the extension settings. The html handles the display of the popup while the js file stores the settings in the local browser storage.

### Porting the extension

1. Go to `config.ts` and set your communities main channel. This has to be the channel name from the URL of the channel.
```typescript
export const MAIN_CHANNEL = "cerbervt";
```

2. Use `popup.html` to change the appearance of the settings page. You should alter the text and CSS to match the theme of your community.<br/>
_Feel free to change the whole page if you feel like but keep in mind, if the IDs of the input elements are changed, you need to change them in `popup.js` as well._
