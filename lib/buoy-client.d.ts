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
declare class SocketError extends Error {
    readonly event: Event;
    code: string;
    constructor(event: Event);
}
/** Emitted when a message fails to parse or read, non-recoverable. */
declare class MessageError extends Error {
    readonly reason: string;
    readonly underlyingError?: Error | undefined;
    code: string;
    constructor(reason: string, underlyingError?: Error | undefined);
}

/** Shared options. */
interface Options {
    /** The buoy channel to listen to, minimum 10 chars, usually a uuid string. */
    channel: string;
    /** The buoy service url, e.g. 'https://cb.anchor.link'. */
    service: string;
}

declare enum ListenerEncoding {
    binary = "binary",
    text = "text",
    json = "json"
}
interface ListenerOptions extends Options {
    /** Auto-connect when instantiated, defaults to true. */
    autoConnect?: boolean;
    /** Attempt to parse incoming messages as JSON. */
    json?: boolean;
    /** Receive encoding for incoming messages, defaults to text. */
    encoding?: ListenerEncoding;
    /** WebSocket class to use, if unset will try to use global WebSocket. */
    WebSocket?: any;
}
declare class Listener extends EventEmitter {
    readonly url: string;
    private active;
    private socket?;
    private timer?;
    private reconnectTimer?;
    private encoding;
    private WebSocket;
    constructor(options: ListenerOptions);
    connect(): void;
    disconnect(): void;
    get isConnected(): boolean;
    private handleMessage;
    private setupReconnectionTimer;
}

interface ReceiveContext {
    /** Can be called by sender to cancel the receive. */
    cancel?: () => void;
}
interface ReceiveOptions extends ListenerOptions {
    /** How many milliseconds to wait before giving up. */
    timeout?: number;
}
/**
 * Receive a single message from a buoy channel.
 * @note Instantiate a [[Listener]] if you want to receive multiple messages over the same channel.
 */
declare function receive(options: ReceiveOptions, ctx?: ReceiveContext): Promise<any>;

/** Options for the [[send]] method. */
interface SendOptions extends Options {
    /**
     * How many milliseconds to wait for delivery.
     * If used in conjunction with requireDelivery the promise will reject
     * if the message is not delivered within the given timeout.
     */
    timeout?: number;
    /** Whether to only return on a guaranteed delivery. Can only be used if timeout is set. */
    requireDelivery?: boolean;
    /** Fetch function to use, if unset will attempt to use global fetch. */
    fetch?: typeof fetch;
}
/** Result of a [[send]] call. */
declare enum SendResult {
    /** Message was sent but not yet delivered. */
    buffered = "buffered",
    /** Message was delivered to at least 1 listener on the channel. */
    delivered = "delivered"
}
/** A JSON-encodable value. */
declare type JSONValue = string | number | boolean | null | JSONValue[] | {
    [key: string]: JSONValue;
};
/** Data to send, either a string, uint8array or an object that can be JSON encoded. */
declare type SendData = string | Uint8Array | JSONValue;
/**
 * Sends a message to the channel.
 * @returns a promise that resolves to a [[SendResult]].
 * @throws if the message can't be delivered if [[SendOptions.requireDelivery]] is set.
 */
declare function send(message: SendData, options: SendOptions): Promise<SendResult>;

export { Listener, ListenerEncoding, ListenerOptions, MessageError, Options, ReceiveContext, ReceiveOptions, SendData, SendResult, SocketError, receive, send };
