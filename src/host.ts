import type { Area, BridgeMessage, Items, Seed } from './protocol';
import { PROTOCOL_VERSION, SEED_PREFIX, encodeSeed, isBridgeMessage } from './protocol';

export type BridgeOptions = {
	/**
	 * Namespace for the frame's keys in this page's storage.
	 * Defaults to `__<frame host>__`, so each embedded service gets its own keys.
	 */
	prefix?: string;
};

const storageFor = (area: Area): Storage | undefined => {
	try {
		return area === 'local' ? window.localStorage : window.sessionStorage;
	} catch {
		return undefined;
	}
};

const prefixedKeys = (storage: Storage, prefix: string): string[] => {
	const keys: string[] = [];
	for (let i = 0; i < storage.length; ++i) {
		const key = storage.key(i);
		if (key?.startsWith(prefix)) {
			keys.push(key);
		}
	}
	return keys;
};

const readItems = (area: Area, prefix: string): Items | undefined => {
	const storage = storageFor(area);
	if (!storage) {
		return undefined;
	}

	const keys = prefixedKeys(storage, prefix);
	if (!keys.length) {
		return undefined;
	}

	return Object.fromEntries(keys.map((key) => [key.slice(prefix.length), storage.getItem(key) ?? '']));
};

const applyChange = (message: BridgeMessage, prefix: string) => {
	const storage = storageFor(message.area);
	if (!storage) {
		return;
	}

	switch (message.op) {
		case 'set':
			storage.setItem(prefix + message.key, message.value);
			break;
		case 'remove':
			storage.removeItem(prefix + message.key);
			break;
		case 'clear':
			prefixedKeys(storage, prefix).forEach((key) => storage.removeItem(key));
			break;
	}
};

/**
 * Loads `url` into `iframe` with its storage kept in this page, which the browser treats as first
 * party. The frame must load the 321bridge frame script for this to take effect.
 *
 * Returns a function that stops accepting the frame's writes.
 */
export const bridgeFrame = (iframe: HTMLIFrameElement, url: string | URL, options: BridgeOptions = {}): (() => void) => {
	const frameUrl = new URL(url, window.location.href);
	const prefix = options.prefix ?? `__${frameUrl.host}__`;

	const seed: Seed = {
		v: PROTOCOL_VERSION,
		o: window.location.origin,
		l: readItems('local', prefix),
		s: readItems('session', prefix),
	};
	frameUrl.hash = SEED_PREFIX.slice(1) + encodeSeed(seed);

	const onMessage = (event: MessageEvent) => {
		if (event.source !== iframe.contentWindow || event.origin !== frameUrl.origin || !isBridgeMessage(event.data)) {
			return;
		}
		applyChange(event.data, prefix);
	};

	window.addEventListener('message', onMessage);
	iframe.src = frameUrl.toString();

	return () => window.removeEventListener('message', onMessage);
};
