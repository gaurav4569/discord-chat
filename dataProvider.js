/* jshint esversion:6 */

Object.defineProperty( exports, "__esModule", { value: true } );

var path = require( 'path' );
var vscode = require( 'vscode' );

var storage = require( './storage' );
var utils = require( './utils' );

var servers = [];

const DEBUG = "debug";
const SERVER = "server";
const CHANNEL = "channel";
const GROUP = "group";

function findServer( e )
{
    return e.type === SERVER && e.id.toString() === this.toString();
};

function findChannel( e )
{
    return e.type === CHANNEL && e.id.toString() === this.toString();
};

function isMuted( element )
{
    return element.muted === true || ( element.parent ? isMuted( element.parent ) : false );
}

var status = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Left, 0 );

class DiscordChatDataProvider
{
    constructor( _context )
    {
        this._context = _context;

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        this._icons = {};
    }

    updateStatusBar()
    {
        var unread = this.unreadCount();
        status.text = "$(comment-discussion) " + unread;
        status.command = "discord-chat.markAllRead";
        status.tooltip = "Click to mark all channels as read";
        if( unread > 0 )
        {
            status.show();
        }
        else
        {
            status.hide();
        }
    }

    getParent( element )
    {
        return element ? element.parent : undefined;
    }

    getChildren( element )
    {
        if( !element )
        {
            var serverList = servers;
            if( vscode.workspace.getConfiguration( 'discord-chat' ).hideMutedServers === true )
            {
                serverList = serverList.filter( e => !e.muted );
            }

            if( serverList.length > 0 )
            {
                return serverList;
            }
            return [ { name: "...", type: DEBUG } ];
        }
        else if( element.type === SERVER )
        {
            var channelList = element.channels;
            if( vscode.workspace.getConfiguration( 'discord-chat' ).hideMutedChannels === true )
            {
                channelList = channelList.filter( e => !e.muted );
            }
            return channelList;
        }
        else if( element.type === CHANNEL )
        {
            return element.name;
        }
    }

    getIcon( name )
    {
        var darkIconPath = this._context.asAbsolutePath( path.join( "resources/icons", "dark", name + ".svg" ) );
        var lightIconPath = this._context.asAbsolutePath( path.join( "resources/icons", "light", name + ".svg" ) );

        return {
            dark: darkIconPath,
            light: lightIconPath
        };
    }

    getTreeItem( element )
    {
        var treeItem = new vscode.TreeItem( element.name );

        treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;

        if( element.type === DEBUG )
        {
            treeItem.tooltip = "Open debug console...";
            treeItem.command = {
                command: "discord-chat.openDebugConsole",
                title: "Open debug console"
            };
        }
        else if( element.type === SERVER )
        {
            if( vscode.workspace.getConfiguration( 'discord-chat' ).useIcons === true && element.iconPath )
            {
                treeItem.iconPath = { dark: element.iconPath, light: element.iconPath };
            }
            else if( element.name === utils.directMessagesServerName() )
            {
                treeItem.iconPath = this.getIcon( "dm" );
            }
            else
            {
                treeItem.iconPath = this.getIcon( SERVER );
            }
            treeItem.id = element.id;
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            treeItem.tooltip = "";
            treeItem.command = {
                command: "discord-chat.selectServer",
                title: "Select server",
                arguments: [
                    element.server
                ]
            };
        }
        else if( element.type === CHANNEL )
        {
            treeItem.iconPath = this.getIcon( CHANNEL );

            if( vscode.workspace.getConfiguration( 'discord-chat' ).useIcons === true )
            {
                if( element.channel.type === "dm" && element.iconPath )
                {
                    treeItem.iconPath = { dark: element.iconPath, light: element.iconPath };
                }
                else if( element.channel.type === GROUP )
                {
                    treeItem.iconPath = this.getIcon( GROUP );
                }
            }

            treeItem.id = element.parent.id + element.id;
            treeItem.command = {
                command: "discord-chat.openChannel",
                title: "Open channel",
                arguments: [
                    element.channel
                ]
            };

        }

        if( element.unreadCount && element.unreadCount > 0 && !isMuted( element ) )
        {
            treeItem.label +=
                ( " (" + element.unreadCount +
                    ( element.unreadCount >= vscode.workspace.getConfiguration( 'discord-chat' ).history ? "+" : "" ) +
                    ")" );
        }

        if( element.muted )
        {
            treeItem.label += " (muted)";
        }

        return treeItem;
    }

    setIcons( icons )
    {
        this._icons = icons;
    }

    populate( user, channels )
    {
        var me = this;

        servers = [];

        channels.map( function( channel )
        {
            if( utils.isReadableChannel( user, channel ) )
            {
                var server = servers.find( findServer, utils.toParentId( channel ) );
                if( server === undefined )
                {
                    server = {
                        type: SERVER,
                        name: utils.toServerName( channel ),
                        server: channel.guild,
                        channels: [],
                        id: utils.toParentId( channel ),
                        unreadCount: 0,
                        iconPath: channel.guild ? me._icons[ channel.guild.id ] : undefined,
                        muted: channel.guild ? storage.getServerMuted( channel.guild ) : false
                    };
                    servers.push( server );
                }

                var channelName = utils.toChannelName( channel );

                var channelElement = server.channels.find( findChannel, channel.id.toString() );
                if( channelElement === undefined )
                {
                    channelElement = {
                        type: CHANNEL,
                        name: channelName,
                        channel: channel,
                        users: [],
                        id: channel.id.toString(),
                        unreadCount: 0,
                        parent: server,
                        muted: storage.getChannelMuted( channel )
                    };
                    server.channels.push( channelElement );

                    if( channel.type === "dm" && channel.recipient && me._context.storagePath )
                    {
                        if( channel.recipient.avatarURL )
                        {
                            var filename = path.join( me._context.storagePath, "avatar_" + channel.recipient.id.toString() + utils.urlExt( channel.recipient.avatarURL ) );
                            channelElement.iconPath = filename;
                            utils.fetchIcon( channel.recipient.avatarURL, filename, function() { } );
                        }
                    }
                }

                if( !channel.guild || storage.isChannelMuted( channel ) !== true )
                {
                    channel.fetchMessages( { limit: vscode.workspace.getConfiguration( 'discord-chat' ).history } ).then( function( messages )
                    {
                        me.setUnread( channel, messages );
                    } );
                }
            }
        } );
    }

    updateServerCount( serverElement )
    {
        if( serverElement && storage.getServerMuted( serverElement ) !== true )
        {
            serverElement.unreadCount = serverElement.channels.reduce( ( total, channel ) => total + channel.unreadCount, 0 );
            this._onDidChangeTreeData.fire();
        }
        this.updateStatusBar();
    }

    getChannelElement( channel )
    {
        var channelElement;
        var serverElement = servers.find( findServer, utils.toParentId( channel ) );
        if( serverElement )
        {
            channelElement = serverElement.channels.find( findChannel, channel.id.toString() );
        }
        return channelElement;
    }

    getServerElement( server )
    {
        return servers.find( findServer, server.id.toString() );
    }

    unreadCount()
    {
        return servers.reduce( ( total, serverElement ) => total + ( serverElement.muted ? 0 : serverElement.unreadCount ), 0 );
    }

    update( message )
    {
        var channelElement = this.getChannelElement( message.channel );
        if( channelElement )
        {
            ++channelElement.unreadCount;
            this.updateServerCount( servers.find( findServer, utils.toParentId( message.channel ) ) );
        }
    }

    setUnread( channel, messages )
    {
        var channelElement = this.getChannelElement( channel );
        if( channelElement )
        {
            var storedDate = storage.getLastRead( channel );
            var channelLastRead = new Date( storedDate ? storedDate : 0 );
            channelElement.unreadCount = messages.reduce( ( total, message ) => total + ( message.createdAt > channelLastRead ? 1 : 0 ), 0 );
            this.updateServerCount( servers.find( findServer, utils.toParentId( channel ) ) );
        }
    }

    markChannelRead( channel, inhibitUpdate )
    {
        var channelElement = this.getChannelElement( channel );
        if( channelElement )
        {
            channelElement.unreadCount = 0;
            storage.setLastRead( channel );
            if( inhibitUpdate !== false )
            {
                storage.updateLastRead();
            }
            this.updateServerCount( servers.find( findServer, utils.toParentId( channel ) ) );
        }
    }

    markAllRead()
    {
        var me = this;

        servers.map( serverElement =>
        {
            serverElement.channels.map( channelElement =>
            {
                me.markChannelRead( channelElement.channel, false );
            } );
        } );
        storage.updateLastRead();
        this.updateStatusBar();
    }

    markServerRead( server )
    {
        var me = this;

        var serverElement = servers.find( findServer, server.id.toString() );
        if( serverElement )
        {
            serverElement.channels.map( channelElement =>
            {
                me.markChannelRead( channelElement.channel, false );
            } );
            serverElement.unreadCount = 0;
            storage.updateLastRead();
            this._onDidChangeTreeData.fire( serverElement );
            this.updateStatusBar();
        }
    }

    setChannelMuted( channel, muted )
    {
        var channelElement = this.getChannelElement( channel );
        if( channelElement )
        {
            storage.setChannelMuted( channel, muted );
            channelElement.muted = muted;
            this._onDidChangeTreeData.fire( channelElement );
            this.updateStatusBar();
        }
    }

    setServerMuted( server, muted )
    {
        var serverElement = servers.find( findServer, server.id.toString() );
        if( serverElement )
        {
            storage.setServerMuted( server, muted );
            serverElement.muted = muted;
            this._onDidChangeTreeData.fire( serverElement );
            this.updateStatusBar();
        }
    }

    refresh()
    {
        this._onDidChangeTreeData.fire();
        this.updateStatusBar();
    }
}

exports.DiscordChatDataProvider = DiscordChatDataProvider;
