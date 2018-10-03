/* jshint esversion:6 */

var discord = require( 'discord.js' );
var fs = require( 'fs' );
var path = require( 'path' );
var vscode = require( 'vscode' );

var storage = require( './storage' );
var treeView = require( './dataProvider' );
var utils = require( './utils' );
var chats = require( './chats' );

var outputChannels = {};
var currentServer;
var currentChannel;
var decorations = [];

var currentEditor;
var currentVisibleEditors = [];

var channelMessages = {};

var oldMessageMask = vscode.window.createTextEditorDecorationType( { textDecoration: 'none; opacity: 0.5' } );

var discordChatExplorerView;
var discordChatView;

function activate( context )
{
    const client = new discord.Client();

    var provider = new treeView.DiscordChatDataProvider( context );
    var generalOutputChannel = vscode.window.createOutputChannel( 'discord-chat' );

    storage.initialize( generalOutputChannel, context.workspaceState );

    function setCurrentChannel( channel )
    {
        currentChannel = channel;
        provider.setCurrentChannel( channel );
        updateSelectionState();
    }

    function getDecoration( tag )
    {
        return vscode.window.createTextEditorDecorationType( {
            light: { color: utils.toDarkColour( tag ) },
            dark: { color: utils.toLightColour( tag ) },
        } );
    }

    function promptForToken()
    {
        vscode.window.showInformationMessage(
            "Please set your discord-chat.token",
            "Help",
            "Enter token",
            "OK" ).then( button =>
            {
                if( button === "Help" )
                {
                    vscode.commands.executeCommand( 'vscode.open', vscode.Uri.parse( "https://discordhelp.net/discord-token" ) );
                    promptForToken();
                }
                else if( button === "Enter token" )
                {
                    vscode.window.showInputBox( { prompt: "Token:" } ).then( function( token )
                    {
                        if( token )
                        {
                            vscode.workspace.getConfiguration( 'discord-chat' ).update( 'token', token, true );
                        }
                        else
                        {
                            promptForToken();
                        }
                    } );
                }
            } );
    }

    function login()
    {
        generalOutputChannel.appendLine( "Logging in..." );

        var token = vscode.workspace.getConfiguration( 'discord-chat' ).get( 'token' );
        if( token )
        {
            client.login( token ).then( function()
            {
            } ).catch( function( reason )
            {
                generalOutputChannel.appendLine( reason );
            } );
        }
        else
        {
            promptForToken();
        }
    }

    function updateSelectionState()
    {
        vscode.commands.executeCommand( 'setContext', 'discord-channel-selected', currentChannel !== undefined );
        console.log( "CC:" + currentChannel + " CS:" + currentServer );
        console.log( "server selected: " + ( currentServer !== undefined && currentChannel === undefined ) );
        vscode.commands.executeCommand( 'setContext', 'discord-server-selected', currentServer !== undefined && currentChannel === undefined );
        if( currentServer && currentChannel === undefined )
        {
            var serverElement = provider.getServerElement( currentServer );
            vscode.commands.executeCommand( 'setContext', 'discord-server-has-unread', serverElement && serverElement.unreadCount > 0 );
        }
        else
        {
            vscode.commands.executeCommand( 'setContext', 'discord-server-has-unread', false );
        }
        var canMute = false;
        var canUnmute = false;
        if( currentChannel )
        {
            canUnmute = storage.getChannelMuted( currentChannel ) === true;
            canMute = !canUnmute;
        }
        else if( currentServer )
        {
            canUnmute = storage.getServerMuted( currentServer ) === true;
            canMute = !canUnmute;
        }
        vscode.commands.executeCommand( 'setContext', 'discord-can-mute', canMute );
        vscode.commands.executeCommand( 'setContext', 'discord-can-unmute', canUnmute );

        var children = provider.getChildren();
        var empty = children.length === 1 && children[ 0 ].name === "...";
        vscode.commands.executeCommand( 'setContext', 'discord-chat-tree-not-empty',
            ( vscode.workspace.getConfiguration( 'discord-chat' ).get( 'hideEmptyTree' ) === false ) || ( empty === false ) );
    }

    function getUnreadMessages( done, channel, messages, before )
    {
        channel.fetchMessages( { limit: 100, before: before } ).then( function( newMessages )
        {
            var storedDate = storage.getLastRead( channel );
            var channelLastRead = new Date( storedDate ? storedDate : 0 );
            var unreadMessages = newMessages.filter( function( message )
            {
                return message.createdAt > channelLastRead;
            } );

            messages = messages ? messages.concat( unreadMessages.clone() ) : unreadMessages.clone();

            if( unreadMessages.array().length > 0 )
            {
                getUnreadMessages( done, channel, messages, unreadMessages.last().id );
            }
            else
            {
                channelMessages[ channel.id.toString() ] = messages;
                provider.setUnread( channel, messages );
                done();
            }
        } );
    }

    function populateChannelMessages( user, channels )
    {
        channels.map( function( channel )
        {
            if( utils.isReadableChannel( user, channel ) )
            {
                // TODO populate if muted?
                if( !channel.guild || storage.isChannelMuted( channel ) !== true )
                {
                    getUnreadMessages( function()
                    {
                        var channelId = channel.id.toString();

                        var messages = channelMessages[ channel.id.toString() ];
                        var before = messages && messages.size > 0 ? messages.last().id : undefined;

                        channel.fetchMessages( { limit: vscode.workspace.getConfiguration( 'discord-chat' ).get( 'history' ), before: before } ).then( function( oldMessages )
                        {
                            channelMessages[ channelId ] = messages ? messages.concat( oldMessages.clone() ) : oldMessages.clone();

                            channelMessages[ channelId ].array().reverse().map( function( message )
                            {
                                var compact = vscode.workspace.getConfiguration( 'discord-chat' ).get( 'compactView' );
                                chats.addMessage( channelId, chats.formatMessage( message, compact ), message.createdAt );
                            } );
                        } );
                    }, channel );
                }
            }
        }, this );
    }

    function refreshChannel( channel )
    {
        var channelId = channel.id.toString();

        outputChannels[ channelId ].outputChannel.clear();

        if( storage.getChannelMuted( channel ) !== true )
        {
            chats.getReadMessages( channelId ).map( function( entry )
            {
                outputChannels[ channelId ].outputChannel.appendLine( entry );
            } );

            chats.getUnreadMessages( channelId ).map( function( entry )
            {
                outputChannels[ channelId ].outputChannel.appendLine( entry );
            } );
        }
    }

    function populateChannel( channel )
    {
        var channelId = channel.id.toString();

        outputChannels[ channelId ].outputChannel.clear();

        if( storage.getChannelMuted( channel ) !== true )
        {
            refreshChannel( channel );

            var storedDate = storage.getLastRead( channel );
            var channelLastRead = new Date( storedDate ? storedDate : 0 );

            provider.setCurrentChannel( channel );
            provider.markChannelRead( channel );
            chats.chatRead( channelId, channelLastRead );
        }
    }

    function refresh()
    {
        function onSync()
        {
            var pending = client.guilds ? client.guilds.size : 0;
            var icons = {};

            function checkFinished()
            {
                --pending;
                if( pending === 0 )
                {
                    provider.setIcons( icons );
                    provider.populate( client.user, client.channels );

                    populateChannelMessages( client.user, client.channels );

                    provider.refresh();
                }
            }

            if( client.readyAt === null )
            {
                login();
            }
            else
            {
                var storagePath = context.storagePath;
                if( context.storagePath && !fs.existsSync( context.storagePath ) )
                {
                    fs.mkdirSync( context.storagePath );
                }
                if( storagePath && client.guilds )
                {
                    client.guilds.map( guild =>
                    {
                        if( guild.iconURL )
                        {
                            var filename = path.join( storagePath, "server_" + guild.id.toString() + utils.urlExt( guild.iconURL ) );
                            icons[ guild.id.toString() ] = filename;
                            utils.fetchIcon( guild.iconURL, filename, checkFinished );
                        }
                        else
                        {
                            checkFinished();
                        }
                    } );
                }
                else
                {
                    provider.populate( client.user, client.channels );
                    populateChannelMessages( client.user, client.channels );

                    provider.refresh();
                }
            }
        }

        storage.sync( onSync );
    }

    function highlightUserNames()
    {
        function escapeRegExp( str )
        {
            return str.replace( /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&" );
        }

        var visibleEditors = vscode.window.visibleTextEditors;

        visibleEditors.map( editor =>
        {
            if( editor.document && editor.document.uri && editor.document.uri.scheme === 'output' )
            {
                var highlights = {};

                const text = editor.document.getText();
                var userList = [];
                if( client.users.size )
                {
                    client.users.map( user => { userList.push( escapeRegExp( "@" + user.username ) ); } );
                    var regex = new RegExp( "(" + userList.join( "|" ) + ")", 'g' );
                    let match;
                    while( ( match = regex.exec( text ) ) !== null )
                    {
                        const tag = match[ match.length - 1 ];
                        const startPos = editor.document.positionAt( match.index );
                        const endPos = editor.document.positionAt( match.index + match[ 0 ].length );
                        const decoration = { range: new vscode.Range( startPos, endPos ) };
                        if( highlights[ tag ] === undefined )
                        {
                            highlights[ tag ] = [];
                        }
                        highlights[ tag ].push( decoration );
                    }
                    decorations.forEach( decoration =>
                    {
                        decoration.dispose();
                    } );
                    Object.keys( highlights ).forEach( tag =>
                    {
                        var decoration = getDecoration( tag );
                        decorations.push( decoration );
                        editor.setDecorations( decoration, highlights[ tag ] );
                    } );
                }
            }
        } );
    }

    function fadeOldMessages()
    {
        var visibleEditors = vscode.window.visibleTextEditors;

        visibleEditors.map( editor =>
        {
            if( editor.document && editor.document.uri && editor.document.uri.scheme === 'output' )
            {
                Object.keys( outputChannels ).forEach( channelId =>
                {
                    if( outputChannels[ channelId ].outputChannel._id === editor.document.fileName )
                    {
                        var rm = chats.getReadMessages( channelId );
                        var length = chats.getReadMessages( channelId ).reduce( ( total, value ) => total += ( value.length + 1 ), 0 );

                        const fullRange = new vscode.Range(
                            editor.document.positionAt( 0 ),
                            editor.document.positionAt( length - 1 )
                        )

                        editor.setDecorations( oldMessageMask, [ fullRange ] );
                    }
                } );
            }
        } );
    }

    function decorateOutputChannel()
    {
        highlightUserNames();
        fadeOldMessages();
    }

    function hideOutputChannel( outputChannel )
    {
        if( outputChannel._id !== currentEditor )
        {
            outputChannel.hide();
        }
    }

    function setAutoClose( channelId )
    {
        var autoHidePeriod = vscode.workspace.getConfiguration( 'discord-chat' ).get( 'autoHide' );
        if( autoHidePeriod > 0 )
        {
            var timer = outputChannels[ channelId ].autoHideTimer;
            if( timer )
            {
                clearTimeout( timer );
            }
            outputChannels[ channelId ].autoHideTimer = setTimeout( hideOutputChannel, autoHidePeriod * 1000, outputChannels[ channelId ].outputChannel );
        }
    }

    function addMessageToChannel( message )
    {
        var channelId = message.channel.id.toString();

        var compact = vscode.workspace.getConfiguration( 'discord-chat' ).get( 'compactView' );
        var formattedMessage = chats.formatMessage( message, compact );
        chats.addMessage( channelId, formattedMessage, message.createdAt );

        var outputChannel = outputChannels[ channelId ] && outputChannels[ channelId ].outputChannel;
        if( outputChannel )
        {
            formattedMessage.map( function( line )
            {
                outputChannel.appendLine( line );
            } );
        }
    }

    function updateCurrentChannel( message )
    {
        addMessageToChannel( message );
        setAutoClose( message.channel.id.toString() );
        provider.markChannelRead( message.channel );
    }

    function selectServer( server )
    {
        console.log( "select server!" );
        currentServer = server;
        setCurrentChannel( undefined );
        updateSelectionState();
    }

    function revealElement( element, focus, select )
    {
        if( discordChatExplorerView.visible === true )
        {
            discordChatExplorerView.reveal( element, { focus: focus, select: select } );
        }
        if( discordChatView.visible === true )
        {
            discordChatView.reveal( element, { focus: focus, select: select } );
        }
    }

    function updateChannel( message, hidden )
    {
        function showNotification()
        {
            var notify = vscode.workspace.getConfiguration( 'discord-chat' ).get( 'notify' );
            if( notify === "always" || ( notify == "whenHidden" && hidden === true ) )
            {
                var compact = vscode.workspace.getConfiguration( 'discord-chat' ).get( 'compactView' );
                vscode.window.showInformationMessage( chats.formatMessage( message, compact, true ).join() );
            }
        }

        addMessageToChannel( message );

        provider.update( message );

        showNotification();
    }

    function updateViewSelection( e, view )
    {
        if( e.visible )
        {
            var element = currentChannel ? provider.getChannelElement( currentChannel ) :
                ( currentServer ? provider.getServerElement( currentServer ) : undefined );

            if( element )
            {
                view.reveal( element, { focus: false, select: true } );
            }
        }
    }

    function setShowUnreadOnly( enabled )
    {
        context.workspaceState.update( 'showUnreadOnly', enabled );
        vscode.commands.executeCommand( 'setContext', 'discord-show-unread-only', context.workspaceState.get( 'showUnreadOnly' ) );
        provider.refresh();
    }

    function openChannel( channel )
    {
        currentServer = channel.guild;

        var channelId = channel.id.toString();
        var outputChannel = outputChannels[ channelId ];
        if( !outputChannel )
        {
            outputChannel = vscode.window.createOutputChannel( utils.toOutputChannelName( channel ) + "." + channelId );
            outputChannel.clear();
            outputChannels[ channelId ] = {
                outputChannel: outputChannel,
                discordChannel: channel,
            };
            context.subscriptions.push( outputChannel );

            populateChannel( channel );
        }
        else
        {
            outputChannel = outputChannel.outputChannel;
        }

        outputChannel.show( true );

        provider.markChannelRead( channel );
    }

    function register()
    {
        updateSelectionState();

        discordChatExplorerView = vscode.window.createTreeView( 'discord-chat-view-explorer', { treeDataProvider: provider } );
        discordChatView = vscode.window.createTreeView( 'discord-chat-view', { treeDataProvider: provider } );

        context.subscriptions.push( discordChatExplorerView );
        context.subscriptions.push( discordChatView );

        context.subscriptions.push( discordChatExplorerView.onDidExpandElement( e => selectServer( e.element.server ) ) );
        context.subscriptions.push( discordChatExplorerView.onDidCollapseElement( e => selectServer( e.element.server ) ) );
        context.subscriptions.push( discordChatView.onDidExpandElement( e => selectServer( e.element.server ) ) );
        context.subscriptions.push( discordChatView.onDidCollapseElement( e => selectServer( e.element.server ) ) );
        context.subscriptions.push( discordChatExplorerView.onDidChangeVisibility( e => updateViewSelection( e, discordChatExplorerView ) ) );
        context.subscriptions.push( discordChatView.onDidChangeVisibility( e => updateViewSelection( e, discordChatView ) ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.refresh', refresh ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.openChannel', openChannel ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.showAll', function() { setShowUnreadOnly( false ); } ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.showUnreadOnly', function() { setShowUnreadOnly( true ); } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.markAllRead', function() { provider.markAllRead(); } ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.resetSync', function() { storage.resetSync(); } ) );
        // TODO FIx this
        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.resetChannelUnread', function() { storage.resetChannel( currentChannel ); } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.markServerRead', function()
        {
            if( currentServer )
            {
                provider.markServerRead( currentServer );
                updateSelectionState();
            }
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.createChannel', function()
        {
            if( currentServer )
            {
                vscode.window.showInputBox( { prompt: "Channel name:" } ).then(
                    function( name )
                    {
                        if( name )
                        {
                            currentServer.createChannel( name, 'text' ).then( function( channel )
                            {
                                refresh();
                                var element = provider.getChannelElement( channel );
                                if( provider.isChannelVisible( element ) )
                                {
                                    revealElement( element, true, true );
                                }
                            } ).catch( e =>
                            {
                                vscode.window.showErrorMessage( e.message );
                            } );
                        }
                    } );
            }
            else
            {
                vscode.window.showInformationMessage( "discord-chat: Please select a server first" );
            }
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.deleteChannel', function()
        {
            if( currentChannel )
            {
                vscode.window.showInformationMessage( "discord-chat: Are you sure?", "Yes", "No" ).then( response =>
                {
                    if( response === "Yes" )
                    {
                        currentChannel.delete().then( function()
                        {
                            outputChannels[ currentChannel.id.toString() ].outputChannel.dispose();
                            setCurrentChannel( undefined );
                            refresh();
                        } ).catch( e =>
                        {
                            console.error( e.message );
                            vscode.window.showErrorMessage( "Failed to delete channel" );
                        } );
                    }
                } );
            }
            else
            {
                vscode.window.showInformationMessage( "discord-chat: Please select a channel first" );
            }
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.closeChannel', function()
        {
            if( currentChannel )
            {
                if( outputChannels[ currentChannel.id.toString() ] )
                {
                    outputChannels[ currentChannel.id.toString() ].outputChannel.dispose();
                    delete outputChannels[ currentChannel.id.toString() ];
                    setCurrentChannel( undefined );
                }
            }
            else
            {
                vscode.window.showInformationMessage( "discord-chat: Please select a channel first" );
            }
        } ) );


        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.leaveServer', function()
        {
            if( currentServer )
            {
                vscode.window.showInformationMessage( "discord-chat: Are you sure?", "Yes", "No" ).then( response =>
                {
                    if( response === "Yes" )
                    {
                        currentServer.channels.map( function( channel )
                        {
                            if( outputChannels[ channel.id.toString() ] )
                            {
                                outputChannels[ channel.id.toString() ].outputChannel.dispose();
                            }
                        } );

                        currentServer.leave().then( function()
                        {
                            refresh();
                        }
                        ).catch( e =>
                        {
                            console.error( e.message );
                            vscode.window.showErrorMessage( "Failed to leave server" );
                        } );
                    }
                } );
            }
            else
            {
                vscode.window.showInformationMessage( "discord-chat: Please select a server first" );
            }
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.post', function()
        {
            if( currentChannel )
            {
                Object.keys( outputChannels ).forEach( channelName =>
                {
                    if( outputChannels[ channelName ].discordChannel === currentChannel )
                    {
                        clearTimeout( outputChannels[ channelName ].autoHideTimer );
                    }
                } );

                vscode.window.showInputBox( { prompt: "Post message to " + utils.toChannelName( currentChannel ) } ).then(
                    function( message )
                    {
                        if( message )
                        {
                            currentChannel.send( message ).then( message =>
                            {
                                generalOutputChannel.appendLine( "Sent message to channel " + currentChannel.name + " at " + new Date().toISOString() );

                                if( currentChannel.type === "dm" || currentChannel.type === "group" )
                                {
                                    // TODO - add to channel not populate
                                    populateChannel( currentChannel );
                                }
                            } ).catch( e =>
                            {
                                console.error( "Failed to send: " + e );
                            } );
                        }
                    } );
            }
            else
            {
                vscode.window.showInformationMessage( "discord-chat: Please select a channel first" );
            }
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.postSelection', function()
        {
            var editor = vscode.window.activeTextEditor;

            if( currentChannel && editor && editor.document )
            {
                if( editor.selection && editor.selection.start != editor.selection.end )
                {
                    var document = editor.document;
                    var selection = document.getText().substring( document.offsetAt( editor.selection.start ), document.offsetAt( editor.selection.end ) );
                    var language = document.languageId;
                    currentChannel.send( selection, { code: language } );
                }
                else
                {
                    vscode.window.showInformationMessage( "discord-chat: nothing selected?" );
                }
            }
            else
            {
                vscode.window.showInformationMessage( "discord-chat: Please select a channel first" );
            }
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.mute', function()
        {
            if( currentChannel )
            {
                if( currentChannel.type === 'text' )
                {
                    provider.setChannelMuted( currentChannel, true );
                }
                else
                {
                    vscode.window.showInformationMessage( "discord-chat: direct message channels can't be muted" );
                }
            }
            else if( currentServer )
            {
                provider.setServerMuted( currentServer, true );
            }

            updateSelectionState();
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.unmute', function()
        {
            if( currentChannel )
            {
                provider.setChannelMuted( currentChannel, undefined );
            }
            else if( currentServer )
            {
                provider.setServerMuted( currentServer, undefined );
            }

            updateSelectionState();
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.openDebugConsole', function()
        {
            generalOutputChannel.show( true );
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'discord-chat.selectServer', ( server ) => selectServer( server ) ) );

        context.subscriptions.push( vscode.window.onDidChangeWindowState( function( e )
        {
            if( e.focused )
            {
                refresh();
            }
        } ) );

        context.subscriptions.push( vscode.window.onDidChangeVisibleTextEditors( function( editors )
        {
            currentVisibleEditors = editors;

            var currentOutputChannelFilename;

            // TODO set server unselected even if no channel selected?
            if( currentChannel !== undefined )
            {
                Object.keys( outputChannels ).map( function( id )
                {
                    if( id === currentChannel.id.toString() )
                    {
                        currentOutputChannelFilename = outputChannels[ id ].outputChannel._id;
                    }
                } );

                if( currentOutputChannelFilename )
                {
                    var currentOutputChannelVisible = false;
                    currentVisibleEditors.map( function( editor )
                    {
                        if( editor.document && editor.document.fileName === currentOutputChannelFilename )
                        {
                            currentOutputChannelVisible = true;
                        }
                    } );

                    if( currentOutputChannelVisible === false )
                    {
                        setCurrentChannel( undefined );
                        currentServer = undefined;
                        updateSelectionState();
                    }
                }
            }
            else
            {
                currentVisibleEditors.map( function( editor )
                {
                    Object.keys( outputChannels ).map( function( id )
                    {
                        if( editor.document && editor.document.fileName === outputChannels[ id ].outputChannel._id )
                        {
                            setCurrentChannel( outputChannels[ id ].discordChannel );
                            updateSelectionState();
                            decorateOutputChannel();
                            setAutoClose( id );
                        }
                    } );
                } );
            }
        } ) );

        context.subscriptions.push( vscode.workspace.onDidChangeTextDocument( function( e )
        {
            currentVisibleEditors.map( function( editor )
            {
                Object.keys( outputChannels ).map( function( id )
                {
                    if( editor.document && editor.document.fileName === outputChannels[ id ].outputChannel._id )
                    {
                        highlightUserNames();
                    }
                } );
            } );
        } ) );

        context.subscriptions.push( vscode.workspace.onDidChangeConfiguration( function( e )
        {
            if( e.affectsConfiguration( 'discord-chat.showInExplorer' ) )
            {
                vscode.commands.executeCommand( 'setContext', 'discord-chat-in-explorer', vscode.workspace.getConfiguration( 'discord-chat' ).get( 'showInExplorer' ) );
            }
            else if( e.affectsConfiguration( 'discord-chat.hideEmptyTree' ) )
            {
                updateSelectionState();
            }
            else if( e.affectsConfiguration( 'discord-chat.token' ) && client.readyAt === null )
            {
                login();
            }
            else if(
                e.affectsConfiguration( 'discord-chat.compactView' ) ||
                e.affectsConfiguration( 'discord-chat.history' ) )
            {
                Object.keys( outputChannels ).map( outputChannelName =>
                {
                    outputChannels[ outputChannelName ].outputChannel.clear();
                    populateChannel( outputChannels[ outputChannelName ].discordChannel );
                } );
            }
            else if( e.affectsConfiguration( 'discord-chat.useIcons' ) )
            {
                refresh();
            }
            else if(
                e.affectsConfiguration( 'discord-chat.hideMutedServers' ) ||
                e.affectsConfiguration( 'discord-chat.hideMutedChannels' ) )
            {
                provider.refresh();
            }
            else if(
                e.affectsConfiguration( 'discord-chat.syncToken' ) ||
                e.affectsConfiguration( 'discord-chat.syncGistId' ) )
            {
                storage.initializeSync();
            }
        } ) );

        context.subscriptions.push( generalOutputChannel );

        vscode.commands.executeCommand( 'setContext', 'discord-chat-in-explorer', vscode.workspace.getConfiguration( 'discord-chat' ).get( 'showInExplorer' ) );
        vscode.commands.executeCommand( 'setContext', 'discord-show-unread-only', context.workspaceState.get( 'showUnreadOnly' ) );

        client.on( 'error', error =>
        {
            generalOutputChannel.appendLine( "error: " + error.message );
        } );
        client.on( 'warn', warning =>
        {
            generalOutputChannel.appendLine( "warning: " + warning );
        } );
        client.on( 'debug', message =>
        {
            if( vscode.workspace.getConfiguration( 'discord-chat' ).get( 'debug' ) === true )
            {
                generalOutputChannel.appendLine( "debug: " + message );
            }
        } );

        client.on( 'ready', () =>
        {
            generalOutputChannel.appendLine( "Logged in as " + client.user.tag );
            refresh();
        } );

        client.on( 'message', message =>
        {
            function isOutputChannelVisible( id )
            {
                var visible = false;
                if( outputChannels[ id ] !== undefined )
                {
                    currentVisibleEditors.map( function( editor )
                    {
                        if( editor.document && editor.document.fileName === outputChannels[ id ].outputChannel._id )
                        {
                            visible = true;
                        }
                    } );
                }
                return visible;
            }

            if( utils.isReadableChannel( client.user, message.channel ) )
            {
                if( storage.isChannelMuted( message.channel ) !== true )
                {
                    var outputChannelName = utils.toOutputChannelName( message.channel );

                    generalOutputChannel.appendLine( "Received message on " + outputChannelName );

                    if( outputChannelName )
                    {
                        var hidden = isOutputChannelVisible( message.channel.id.toString() ) === false;
                        var focused = vscode.window.state.focused;
                        if( hidden === true && focused === true && vscode.workspace.getConfiguration( 'discord-chat' ).get( 'autoShow' ) === true )
                        {
                            var outputChannelAlreadyVisible = false;
                            Object.keys( outputChannels ).map( function( id )
                            {
                                currentVisibleEditors.map( function( editor )
                                {
                                    if( editor.document && editor.document.fileName === outputChannels[ id ].outputChannel._id )
                                    {
                                        outputChannelAlreadyVisible = true;
                                    }
                                } );

                                if( outputChannels[ id ].outputChannel.visible === true )
                                {
                                    outputChannelAlreadyVisible = true;
                                }
                            } );

                            if( outputChannelAlreadyVisible === false )
                            {
                                hidden = false;
                                if( outputChannels[ message.channel.id.toString() ] === undefined )
                                {
                                    openChannel( message.channel );
                                }
                                else
                                {
                                    outputChannels[ message.channel.id.toString() ].outputChannel.show();
                                }
                            }
                        }

                        if( hidden )
                        {
                            updateChannel( message, hidden );
                            updateSelectionState();
                        }
                        else
                        {
                            updateCurrentChannel( message );
                        }
                    }
                }
            }
        } );

        login();
    }

    register();

    return storage;
}

function deactivate()
{
}

exports.activate = activate;
exports.deactivate = deactivate;
