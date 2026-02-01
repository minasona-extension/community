# Palsona Twitch Badges

See cute Palsonas not only on stream or in the Discord but in the Twitch chat as well!

This extension displays the Palsonas of a user as badges right next to their username in Twitch chat. It's a neat addon to the chat and helps people get to know everyone's Palsonas better.

Settings:
- Priority List: Rank the prioritiy of different communities and toggle them on or off.
  - Currently watched channel Palsonas: Displays the Palsona of the currently watched community.
- Limit Palsonas: Decide how many icons there should be for each user by limiting them.
- Size: Use the slider to make the chat icons smaller or larger.

## Out Now

### Chrome v-

### Edge v-

### Opera v-
[Download from chrome store]()

### Firefox v-

## Changelog

### 1.0

- Extension working for multiple communities

## Docs

### Building the extension

_Use Node v22.14.0_

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

3. You can find the files for the extension inside `dist/`.

### Structure of the project

- `background.ts` is the background script of the extension. It is used to fetch the user list from the API and store it in the local browser storage.
- `content.ts` is the frontend script. It can interact with the web page and is used to read the usernames in the chat and create and insert the corresponding icons.
- `popup.html` / `popup.ts` is the popup displayed when opening the extension settings. The html handles the display of the popup while the js file stores the settings in the local browser storage.
