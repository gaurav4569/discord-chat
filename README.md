# Discord Chat

A [Discord](https://discordapp.com/) chat client for vscode.

After installing, go to your settings and set `discord-chat.token` to your API token. See [here](https://discordhelp.net/discord-token) for one way of finding your token. There are other ways too.

*NOTE: Keep your token to yourself!*

A tree view will show available servers and channels. Click on a channel to open the channel in the output panel. Click the post icon in the tree view or use the `discord-chat: Post` command to send a message to the currently selected channel.

<img src="https://raw.githubusercontent.com/Gruntfuggly/discord-chat/master/resources/screenshot.png">

### Commands

- `discord-chat: Post` - send a message to the selected channel
- `discord-chat: Create Channel` - create a new channel on the selected server
- `discord-chat: Delete Channel` - delete the currently selected channel
- `discord-chat: Mark All Read` - reset unread count on all channels on all servers
- `discord-chat: Mark All Channels on Server as Read` - reset unread count on all channels on the currently selected server
- `discord-chat: Refresh` - repopulate the channel list
- `discord-chat: Mute` - mute the currently selected server or channel
- `discord-chat: Unmute` - unmute a previously muted server or channel

### Notifications

Notifications are generated if a message arrives from a channel other that the currently selected channel. By default these these will only be shown if the channel tree is hidden (or collapsed). See *Configuration* for other settings.

### Muting

A muted channel or server will not generate notifications, update it's unread count, or show new messages as they arrive. However, If a muted channel is opened from the tree, the latest messages will be fetched. *Note: This form of muting is local to vscode and does not affect any muted state of discord itself.*

## TODO

- [ ] somehow show avatars
- [ ] support send code
- [ ] support categories

## Installing

You can install the latest version of the extension via the Visual Studio Marketplace [here](https://marketplace.visualstudio.com/items?itemName=Gruntfuggly.discord-chat).

Alternatively, open Visual Studio code, press `Ctrl+P` or `Cmd+P` and type:

    > ext install discord-chat

### Source Code

The source code is available on GitHub [here](https://github.com/Gruntfuggly/discord-chat).

## Configuration

The extension can be customised as follows:

| Setting | Default | Description |
|---------|---------|-------------|
| discord-chat.token | | You need to set this to authenticate with Discord |
| discord-chat.compactView | false | Set this to true to put the date, time, name and first line of the message on one line |
| discord-chat.notify | whenHidden | Can also be set to "always" or "never" |
| discord-chat.highlightDelay | 500 | The delay before highlighting user names (in milliseconds) |
| discord-chat.history | 10 | The number of previous messages to fetch when opening a channel |
| discord-chat.showInExplorer | true | Set this to false if you would rather only see the channel list in a dedicated view in the activity bar |

## Known Issues

This extension only provides features that I currently use or know about. If you feel there is something broken or missing, please add a bug report or feature request in the GitHub repository, [here](https://github.com/Gruntfuggly/discord-chat).

### Credits

Container icon from [iconscout](https://iconscout.com/icon/discord-3).

Extension and group icon made by <a href="http://www.freepik.com" title="Freepik">Freepik</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a> is licensed by <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a>

Unmute and Post icon from made by <a href="https://www.flaticon.com/authors/dave-gandy" title="Dave Gandy">Dave Gandy</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a> is licensed by <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a>

Direct message icon made by <a href="https://www.flaticon.com/authors/yannick" title="Yannick">Yannick</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a> is licensed by <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a>

Tick icon made by <a href="https://www.flaticon.com/authors/eleonor-wang" title="Eleonor Wang">Eleonor Wang</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a> is licensed by <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a>

Mute icon made by <a href="https://www.flaticon.com/authors/pixel-perfect" title="Pixel perfect">Pixel perfect</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a> is licensed by <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a>