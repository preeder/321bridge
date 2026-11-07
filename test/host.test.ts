import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bridgeFrame } from '../src/host';
import { SEED_PREFIX, decodeSeed } from '../src/protocol';

const FRAME_URL = 'https://chat.example/livechat?useBridgedStorage=true';
const PREFIX = '__chat.example__';

let iframe: HTMLIFrameElement;

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	iframe = document.createElement('iframe');
	document.body.appendChild(iframe);
});

afterEach(() => {
	iframe.remove();
});

const seedOf = (frame: HTMLIFrameElement) => {
	const { hash } = new URL(frame.src);
	expect(hash.startsWith(SEED_PREFIX)).toBe(true);
	return decodeSeed(hash.slice(SEED_PREFIX.length));
};

const post = (data: unknown, { origin = 'https://chat.example', source = iframe.contentWindow as Window | null } = {}) => {
	window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
};

describe('bridgeFrame', () => {
	it('loads the frame with only its own saved items', () => {
		localStorage.setItem(`${PREFIX}store`, '{"token":"t"}');
		localStorage.setItem('__other.example__store', 'no');
		localStorage.setItem('site-key', 'no');
		sessionStorage.setItem(`${PREFIX}sid`, 's1');

		bridgeFrame(iframe, FRAME_URL);

		const url = new URL(iframe.src);
		expect(url.origin + url.pathname + url.search).toBe(FRAME_URL);
		expect(seedOf(iframe)).toEqual({
			v: 1,
			o: window.location.origin,
			l: { store: '{"token":"t"}' },
			s: { sid: 's1' },
		});
	});

	it('omits empty areas from the seed', () => {
		bridgeFrame(iframe, FRAME_URL);
		expect(seedOf(iframe)).toEqual({ v: 1, o: window.location.origin });
	});

	it('honours a custom prefix', () => {
		localStorage.setItem('mine:k', 'v');
		bridgeFrame(iframe, FRAME_URL, { prefix: 'mine:' });
		expect(seedOf(iframe)?.l).toEqual({ k: 'v' });
	});

	it('applies the frame writes under its prefix', () => {
		localStorage.setItem(`${PREFIX}old`, '1');
		localStorage.setItem('site-key', 'keep');
		bridgeFrame(iframe, FRAME_URL);

		post({ type: '321bridge', v: 1, area: 'local', op: 'set', key: 'store', value: 'v1' });
		post({ type: '321bridge', v: 1, area: 'session', op: 'set', key: 'sid', value: 's' });
		expect(localStorage.getItem(`${PREFIX}store`)).toBe('v1');
		expect(sessionStorage.getItem(`${PREFIX}sid`)).toBe('s');

		post({ type: '321bridge', v: 1, area: 'local', op: 'remove', key: 'store' });
		expect(localStorage.getItem(`${PREFIX}store`)).toBeNull();

		post({ type: '321bridge', v: 1, area: 'local', op: 'clear' });
		expect(localStorage.getItem(`${PREFIX}old`)).toBeNull();
		expect(localStorage.getItem('site-key')).toBe('keep');
	});

	it('ignores writes from other frames or origins', () => {
		bridgeFrame(iframe, FRAME_URL);
		const other = document.createElement('iframe');
		document.body.appendChild(other);
		const write = { type: '321bridge', v: 1, area: 'local', op: 'set', key: 'store', value: 'evil' };

		post(write, { source: other.contentWindow });
		post(write, { origin: 'https://evil.example' });
		post(write, { source: null });
		post({ ...write, type: 'rocketchat' });

		expect(localStorage.getItem(`${PREFIX}store`)).toBeNull();
		other.remove();
	});

	it('stops accepting writes once disconnected', () => {
		const disconnect = bridgeFrame(iframe, FRAME_URL);
		disconnect();

		post({ type: '321bridge', v: 1, area: 'local', op: 'set', key: 'store', value: 'late' });
		expect(localStorage.getItem(`${PREFIX}store`)).toBeNull();
	});
});
