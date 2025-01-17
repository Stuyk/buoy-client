/**
 * @greymass/buoy v1.0.3
 * https://github.com/greymass/buoy-client
 *
 * @license
 * Copyright (c) 2021 FFF00 Agents AB & Greymass Inc. All Rights Reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 * 
 *  1. Redistribution of source code must retain the above copyright notice, this
 *     list of conditions and the following disclaimer.
 * 
 *  2. Redistribution in binary form must reproduce the above copyright notice,
 *     this list of conditions and the following disclaimer in the documentation
 *     and/or other materials provided with the distribution.
 * 
 *  3. Neither the name of the copyright holder nor the names of its contributors
 *     may be used to endorse or promote products derived from this software without
 *     specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 * IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
 * BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE
 * OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 * YOU ACKNOWLEDGE THAT THIS SOFTWARE IS NOT DESIGNED, LICENSED OR INTENDED FOR USE
 * IN THE DESIGN, CONSTRUCTION, OPERATION OR MAINTENANCE OF ANY MILITARY FACILITY.
 */
import EventEmitter from 'eventemitter3';

/** Emitted when a network error occurs, can safely be ignored. */
class SocketError extends Error {
    event;
    code = 'E_NETWORK';
    constructor(event) {
        super('Socket error');
        this.event = event;
    }
}
/** Emitted when a message fails to parse or read, non-recoverable. */
class MessageError extends Error {
    reason;
    underlyingError;
    code = 'E_MESSAGE';
    constructor(reason, underlyingError) {
        super(reason);
        this.reason = reason;
        this.underlyingError = underlyingError;
    }
}

const globalBuoy$1 = globalThis || window;
var ListenerEncoding;
(function (ListenerEncoding) {
    ListenerEncoding["binary"] = "binary";
    ListenerEncoding["text"] = "text";
    ListenerEncoding["json"] = "json";
})(ListenerEncoding || (ListenerEncoding = {}));
class Listener extends EventEmitter {
    url;
    active = false;
    socket;
    timer;
    reconnectTimer;
    encoding;
    WebSocket;
    constructor(options) {
        super();
        if (!options.service) {
            throw new Error('Options must include a service url');
        }
        if (!options.channel) {
            throw new Error('Options must include a channel name');
        }
        const baseUrl = options.service.replace(/^http/, 'ws').replace(/\/$/, '');
        this.url = `${baseUrl}/${options.channel}?v=2`;
        this.encoding = options.encoding || ListenerEncoding.text;
        this.WebSocket = options.WebSocket || globalBuoy$1.WebSocket;
        if (options.autoConnect !== false) {
            this.connect();
        }
    }
    connect() {
        if (this.active)
            return;
        this.active = true;
        let retries = 0;
        let pingTimer;
        const connect = () => {
            const socket = new this.WebSocket(this.url);
            socket.onmessage = (event) => {
                if (typeof Blob !== 'undefined' && event.data instanceof Blob) {
                    const reader = new FileReader();
                    reader.onload = () => {
                        this.handleMessage(new Uint8Array(reader.result));
                    };
                    reader.onerror = () => {
                        this.emit('error', new MessageError('Could not read message'));
                    };
                    reader.readAsArrayBuffer(event.data);
                }
                else if (typeof event.data === 'string') {
                    this.handleMessage(new TextEncoder().encode(event.data));
                }
                else if (typeof globalBuoy$1.Buffer !== 'undefined' &&
                    (event.data instanceof globalBuoy$1.Buffer || Array.isArray(event.data))) {
                    let buffer = event.data;
                    if (!globalBuoy$1.Buffer.isBuffer(buffer)) {
                        buffer = globalBuoy$1.Buffer.concat(buffer);
                    }
                    this.handleMessage(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
                }
                else if (event.data instanceof Uint8Array) {
                    this.handleMessage(event.data);
                }
                else if (event.data instanceof ArrayBuffer) {
                    this.handleMessage(new Uint8Array(event.data));
                }
                else {
                    this.emit('error', new MessageError('Unhandled event data type'));
                }
            };
            socket.onerror = (event) => {
                if (this.socket === socket && this.active) {
                    this.emit('error', new SocketError(event));
                }
            };
            socket.onopen = () => {
                retries = 0;
                this.emit('connect');
            };
            socket.onclose = () => {
                if (this.active) {
                    clearTimeout(this.timer);
                    this.timer = setTimeout(connect, backoff(retries++));
                }
                this.socket = undefined;
                clearTimeout(pingTimer);
                if (this.reconnectTimer) {
                    clearInterval(this.reconnectTimer);
                }
                this.emit('disconnect');
            };
            // Reconnect every 10 mins to keep the connection alive
            this.setupReconnectionTimer();
            // fix problem where node.js does not react to the socket going down
            // this terminates the connection if we don't get a heartbeat in 15s (buoy-nodejs sends every 10s)
            const nodeSocket = socket;
            if (typeof nodeSocket.on === 'function' && typeof nodeSocket.terminate === 'function') {
                nodeSocket.on('ping', () => {
                    clearTimeout(pingTimer);
                    pingTimer = setTimeout(() => {
                        nodeSocket.terminate();
                    }, 15 * 1000);
                });
            }
            this.socket = socket;
        };
        connect();
    }
    disconnect() {
        this.active = false;
        if (this.socket &&
            (this.socket.readyState === this.WebSocket.OPEN ||
                this.socket.readyState === this.WebSocket.CONNECTING)) {
            this.socket.close(1000);
        }
    }
    get isConnected() {
        return this.active && this.socket?.readyState == this.WebSocket.OPEN;
    }
    handleMessage(bytes) {
        if (bytes[0] === 0x42 && bytes[1] === 0x42 && bytes[2] === 0x01) {
            this.socket?.send(new Uint8Array([0x42, 0x42, 0x02, bytes[3]]));
            bytes = bytes.subarray(4);
        }
        let message;
        switch (this.encoding) {
            case ListenerEncoding.binary:
                message = bytes;
                break;
            case ListenerEncoding.text:
                message = new TextDecoder().decode(bytes);
                break;
            case ListenerEncoding.json: {
                try {
                    message = JSON.parse(new TextDecoder().decode(bytes));
                }
                catch (error) {
                    this.emit('error', new MessageError('Unable to decode JSON', error));
                    return;
                }
            }
        }
        this.emit('message', message);
    }
    setupReconnectionTimer() {
        this.reconnectTimer = setInterval(() => {
            this.socket?.close(1000);
        }, 10 * 60 * 1000);
    }
}
/**
 * Exponential backoff function that caps off at 5s after 10 tries.
 * @internal
 */
function backoff(tries) {
    return Math.min(Math.pow(tries * 7, 2), 5 * 1000);
}

/**
 * Receive a single message from a buoy channel.
 * @note Instantiate a [[Listener]] if you want to receive multiple messages over the same channel.
 */
function receive(options, ctx) {
    return new Promise((resolve, reject) => {
        const listener = new Listener({ ...options, autoConnect: true });
        let timer;
        let lastError;
        const done = (error, message) => {
            clearTimeout(timer);
            if (error) {
                reject(error);
            }
            else {
                resolve(message);
            }
            listener.disconnect();
        };
        if (ctx) {
            ctx.cancel = () => {
                done(new MessageError('Cancelled', lastError));
            };
        }
        if (options.timeout) {
            timer = setTimeout(() => {
                done(new MessageError('Timed out', lastError));
            }, options.timeout);
        }
        listener.on('error', (error) => {
            if (!(error instanceof SocketError)) {
                done(error);
            }
            else {
                lastError = error;
            }
        });
        listener.once('message', (message) => {
            done(undefined, message);
        });
    });
}

const globalBuoy = globalThis || window;
/** Result of a [[send]] call. */
var SendResult;
(function (SendResult) {
    /** Message was sent but not yet delivered. */
    SendResult["buffered"] = "buffered";
    /** Message was delivered to at least 1 listener on the channel. */
    SendResult["delivered"] = "delivered";
})(SendResult || (SendResult = {}));
/**
 * Sends a message to the channel.
 * @returns a promise that resolves to a [[SendResult]].
 * @throws if the message can't be delivered if [[SendOptions.requireDelivery]] is set.
 */
async function send(message, options) {
    const fetch = options.fetch || globalBuoy.fetch;
    const baseUrl = options.service.replace(/^ws/, 'http').replace(/\/$/, '');
    const url = `${baseUrl}/${options.channel}`;
    const headers = {};
    if (options.requireDelivery) {
        if (!options.timeout) {
            throw new Error('requireDelivery can only be used with timeout');
        }
        headers['X-Buoy-Wait'] = `${Math.ceil(options.timeout / 1000)}`;
    }
    else if (options.timeout) {
        headers['X-Buoy-Soft-Wait'] = `${Math.ceil(options.timeout / 1000)}`;
    }
    let body;
    if (typeof message === 'string' || message instanceof Uint8Array) {
        body = message;
    }
    else {
        body = JSON.stringify(message);
    }
    const response = await fetch(url, { method: 'POST', body, headers });
    if (Math.floor(response.status / 100) !== 2) {
        if (response.status === 408) {
            throw new Error('Unable to deliver message');
        }
        else if (response.status === 410) {
            throw new Error('Request cancelled');
        }
        else {
            throw new Error(`Unexpected status code ${response.status}`);
        }
    }
    return (response.headers.get('X-Buoy-Delivery') || SendResult.buffered);
}

export { Listener, ListenerEncoding, MessageError, SendResult, SocketError, receive, send };
//# sourceMappingURL=buoy-client.m.js.map
