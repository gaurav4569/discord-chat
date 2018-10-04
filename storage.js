var vscode = require( 'vscode' );
var gistore = require( 'gistore' );
var utils = require( './utils' );

var lastSync = undefined;

var state;
var backupTimer;

function sync( callback )
{
    if( gistore.token )
    {
        if( backupInProgress === true )
        {
            utils.log( "WTF!?" );
        }
        gistore.sync().then( function( data )
        {
            var now = new Date();

            utils.log( "Sync at " + now.toISOString() );

            if( state.get( 'lastSync' ) === undefined || data.discordSync.lastSync > state.get( 'lastSync' ) )
            {
                mutedServers = data.discordSync.mutedServers;
                mutedChannels = data.discordSync.mutedChannels;
                lastRead = data.discordSync.lastRead;
                lastSync = data.discordSync.lastSync;

                vscode.workspace.getConfiguration( 'discord-chat' ).update( 'mutedServers', mutedServers, true );
                vscode.workspace.getConfiguration( 'discord-chat' ).update( 'mutedChannels', mutedChannels, true );
                vscode.workspace.getConfiguration( 'discord-chat' ).update( 'lastRead', lastRead, true );
            }

            if( callback )
            {
                callback();
            }
        } ).catch( function( error )
        {
            console.error( "sync failed:" + error );

            if( callback )
            {
                callback();
            }
        } );
    }
    else
    {
        callback();
    }
}

function initializeSync()
{
    var token = vscode.workspace.getConfiguration( 'discord-chat' ).get( 'syncToken', undefined );
    var gistId = vscode.workspace.getConfiguration( 'discord-chat' ).get( 'syncGistId', undefined );

    if( token )
    {
        gistore.setToken( token );

        if( gistId )
        {
            gistore.setId( gistId );

            sync();
        }
        else
        {
            var lastRead = vscode.workspace.getConfiguration( 'discord-chat' ).get( 'lastRead', {} );

            gistore.createBackUp( 'discordSync',
                {
                    discordSync: {
                        mutedServers: mutedServers,
                        mutedChannels: mutedChannels,
                        lastRead: lastRead,
                        lastSync: new Date()
                    }
                } )
                .then( function( id )
                {
                    vscode.workspace.getConfiguration( 'discord-chat' ).update( 'syncGistId', id, true );
                } );
        }
    }
}

function migrateSettings()
{
    state.update( 'mutedChannels', vscode.workspace.getConfiguration( 'discord-chat' ).get( 'mutedChannels', {} ) );
    state.update( 'mutedServers', vscode.workspace.getConfiguration( 'discord-chat' ).get( 'mutedServers', {} ) );
    state.update( 'lastRead', vscode.workspace.getConfiguration( 'discord-chat' ).get( 'lastRead', {} ) );

    vscode.workspace.getConfiguration( 'discord-chat' ).update( 'lastRead', undefined, true );
    vscode.workspace.getConfiguration( 'discord-chat' ).update( 'mutedServers', undefined, true );
    vscode.workspace.getConfiguration( 'discord-chat' ).update( 'mutedChannels', undefined, true );

    state.update( 'migrated', true );
}

function initialize( workspaceState )
{
    state = workspaceState;

    initializeSync();

    if( state.get( 'migrated' ) !== true )
    {
        migrateSettings();
    }
}

function backup()
{
    if( gistore.token )
    {
        var now = new Date();

        backupInProgress = true;

        gistore.backUp( {
            discordSync: {
                mutedServers: mutedServers,
                mutedChannels: mutedChannels,
                lastRead: lastRead,
                lastSync: now
            }
        } ).then( function()
        {
            backupInProgress = false;
            utils.log( "Backup at " + now.toISOString() );
        } ).catch( function( error )
        {
            console.error( "backup failed: " + error );
            triggerBackup();
        } );
    }
}

function triggerBackup()
{
    utils.log( "Backing up in 1 second..." );
    clearTimeout( backupTimer );
    backupTimer = setTimeout( backup, 1000 );
}

function setLastRead( channel )
{
    var now = new Date().toISOString();
    var lastRead = state.get( 'lastRead' );
    lastRead[ channel.id.toString() ] = now;
    state.update( 'lastRead', lastRead );
    triggerBackup();
    utils.log( "Channel " + utils.toChannelName( channel ) + " (" + channel.id.toString() + ") read at " + now );
}

function getLastRead( channel )
{
    return state.get( 'lastRead' )[ channel.id.toString() ];
}

function setLastMessage( channel )
{
    lastMessage[ channel.id.toString() ] = channel.lastMessageID;
}

function updateLastMessage()
{
    vscode.workspace.getConfiguration( 'discord-chat' ).update( 'lastMessage', lastMessage, true ).then( backup );
}

function getLastMessage( channel )
{
    lastMessage = vscode.workspace.getConfiguration( 'discord-chat' ).get( 'lastMessage', {} );
    return lastMessage[ channel.id.toString() ];
}

function setServerMuted( server, muted )
{
    var mutedServers = state.get( 'mutedServers' );
    mutedServers[ server.id.toString() ] = muted;
    state.update( 'mutedServers', mutedServers );
    triggerBackup();
    utils.log( "Server " + server.name + ( muted ? " muted" : " unmuted" ) );
}

function getServerMuted( server )
{
    return server && server.id && state.get( 'mutedServers' )[ server.id.toString() ];
}

function setChannelMuted( channel, muted )
{
    var mutedChannels = state.get( 'mutedChannels' );
    mutedChannels[ channel.id.toString() ] = muted;
    state.update( 'mutedChannels', mutedChannels );
    triggerBackup();
    utils.log( "Channel " + utils.toChannelName( channel ) + ( muted ? " muted" : " unmuted" ) );
}

function getChannelMuted( channel )
{
    return state.get( 'mutedChannels' )[ channel.id.toString() ];
}

function isChannelMuted( channel )
{
    return getServerMuted( channel.guild ) === true || getChannelMuted( channel );
}

function resetSync()
{
    if( gistore.token )
    {
        var now = new Date();
        gistore.backUp( {
            discordSync: {
                mutedServers: {},
                mutedChannels: {},
                lastRead: {},
                lastSync: now
            }
        } ).then( function()
        {
            utils.log( "Reset sync at " + now.toISOString() );
            sync();
        } ).catch( function( error )
        {
            utils.log( "reset failed: " + error );
            console.error( "reset failed: " + error );
        } );
    }
}

function resetState()
{
    state.update( 'mutedServers', {} );
    state.update( 'mutedChannels', {} );
}

function resetChannel( channel )
{
    var lastRead = state.get( 'lastRead' );
    lastRead[ channel.id.toString() ] = undefined;
    state.update( 'lastRead', lastRead );
    backup();
}

module.exports.initialize = initialize;

module.exports.setLastRead = setLastRead;
module.exports.getLastRead = getLastRead;

module.exports.setLastMessage = setLastMessage;
module.exports.updateLastMessage = updateLastMessage;
module.exports.getLastMessage = getLastMessage;

module.exports.setServerMuted = setServerMuted;
module.exports.getServerMuted = getServerMuted;

module.exports.setChannelMuted = setChannelMuted;
module.exports.getChannelMuted = getChannelMuted;
module.exports.isChannelMuted = isChannelMuted;

module.exports.initializeSync = initializeSync;
module.exports.sync = sync;
module.exports.resetSync = resetSync;
module.exports.resetState = resetState;
module.exports.resetChannel = resetChannel;