import { describe, expect, it } from 'vitest';

import { decodeSeed, encodeSeed, isBridgeMessage } from '../src/protocol';
import type { Seed } from '../src/protocol';

describe('seed encoding', () => {
	it('round-trips non-Latin text and emoji', () => {
		const seed: Seed = { v: 1, o: 'https://dealer.example', l: { store: '{"name":"José 李 👋"}' }, s: { id: 'x' } };
		expect(decodeSeed(encodeSeed(seed))).toEqual(seed);
	});

	it('produces URL-safe text', () => {
		const seed: Seed = { v: 1, o: 'https://a.example', l: { k: 'ÿþý>>>???' } };
		expect(encodeSeed(seed)).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it('round-trips large state', () => {
		const seed: Seed = { v: 1, o: 'https://a.example', l: { store: 'x'.repeat(500_000) } };
		expect(decodeSeed(encodeSeed(seed))).toEqual(seed);
	});

	it.each(['', 'not base64!', btoa('not json'), btoa('{"v":2,"o":"x"}'), btoa('{"v":1,"o":"x","l":{"a":1}}')])(
		'rejects %j',
		(text) => {
			expect(decodeSeed(text)).toBeUndefined();
		},
	);
});

describe('isBridgeMessage', () => {
	const base = { type: '321bridge', v: 1, area: 'local' };

	it('accepts each operation', () => {
		expect(isBridgeMessage({ ...base, op: 'set', key: 'a', value: 'b' })).toBe(true);
		expect(isBridgeMessage({ ...base, op: 'remove', key: 'a' })).toBe(true);
		expect(isBridgeMessage({ ...base, op: 'clear' })).toBe(true);
	});

	it('rejects malformed messages', () => {
		expect(isBridgeMessage({ ...base, op: 'set', key: 'a', value: 1 })).toBe(false);
		expect(isBridgeMessage({ ...base, area: 'cookie', op: 'clear' })).toBe(false);
		expect(isBridgeMessage({ ...base, type: 'rocketchat', op: 'clear' })).toBe(false);
		expect(isBridgeMessage({ ...base, op: 'drop' })).toBe(false);
		expect(isBridgeMessage('321bridge')).toBe(false);
	});
});
