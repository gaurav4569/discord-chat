var vscode = require( 'vscode' );
var gistore = require( 'gistore' );
var utils = require( './utils' );

var lastRead = {};
var mutedChannels = {};
var mutedServers = {};
var lastSync = undefined;

var generalOutputChannel;

function sync( callback )
{
    function doSync( callback )
    {
        if( gistore.token )
        {
            gistore.sync().then( function( data )
            {
                var now = new Date();

                utils.log( "Sync at " + now.toISOString() );

            if( lastSync === undefined || data.discordSync.lastSync > lastSync )
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

                processQueue();
            } ).catch( function( error )
            {
                console.error( "sync failed:" + error );

                if( callback )
                {
                    callback();
                }

                processQueue();
            } );
        }
        else
        {
            callback();
            processQueue();
        }
    }

    if( vscode.workspace.getConfiguration( 'discord-chat' ).get( 'syncEnabled' ) === true )
    {
        queue.push( enqueue( doSync, this, [ callback ] ) );

        processQueue();
    }
    else
    {
        callback();
    }
}

function initializeSync()
{
    var enabled = vscode.workspace.getConfiguration( 'discord-chat' ).get( 'syncEnabled', undefined );
    var token = vscode.workspace.getConfiguration( 'discord-chat' ).get( 'syncToken', undefined );
    var gistId = vscode.workspace.getConfiguration( 'discord-chat' ).get( 'syncGistId', undefined );

    if( enabled === true && token )
    {
        gistore.setToken( token );

        if( gistId )
        {
            gistore.setId( gistId );

            sync();
        }
        else
        {
            gistore.createBackUp( 'discordSync',
                {
                    discordSync: {
                        mutedServers: state.get( 'mutedServers' ),
                        mutedChannels: state.get( 'mutedChannels' ),
                        lastRead: state.get( 'lastRead' ),
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

function setActive( isActive )
{
    if( isActive === false )
    {
        backup();
    }
    active = isActive;
}

function backup()
{
    function doBackup()
    {
        if( gistore.token )
        {
            var now = new Date();

            utils.log( "Starting backup at " + now.toISOString() );

            gistore.backUp( {
                discordSync: {
                    mutedServers: state.get( 'mutedServers' ),
                    mutedChannels: state.get( 'mutedChannels' ),
                    lastRead: state.get( 'lastRead' ),
                    lastSync: now
                }
            } ).then( function()
            {
                utils.log( "Backup at " + now.toISOString() );
                processQueue();
            } ).catch( function( error )
            {
                console.error( "backup failed: " + error );
                triggerBackup();
                processQueue();
            } );
        }
        else
        {
            console.log( "backup failed: " + error );
        } );
    }
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
    lastRead = vscode.workspace.getConfiguration( 'discord-chat' ).get( 'lastRead', {} );
    return lastRead[ channel.id.toString() ];
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
    if( channel !== undefined )
    {
        var lastRead = state.get( 'lastRead' );
        lastRead[ channel.id.toString() ] = undefined;
        state.update( 'lastRead', lastRead );
        triggerBackup();
    }
}

module.exports.initialize = initialize;
module.exports.setActive = setActive;

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