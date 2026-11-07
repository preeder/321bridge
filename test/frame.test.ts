import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installFrameStorage } from '../src/frame';
import { SEED_PREFIX, decodeSeed, encodeSeed } from '../src/protocol';
import type { Seed } from '../src/protocol';

type FakeWindow = Window & { parent: { postMessage: ReturnType<typeof vi.fn> } };

const fakeFrame = ({ hash = '', ancestorOrigins = [] as string[], referrer = '', topLevel = false } = {}) => {
	const win = {
		location: { hash, ancestorOrigins },
		document: { referrer },
		history: {
			state: null,
			replaceState: vi.fn((_state: unknown, _title: string, url: string) => {
				win.location.hash = url;
			}),
		},
		parent: { postMessage: vi.fn() },
	};
	if (topLevel) {
		(win as { parent: unknown }).parent = win;
	}
	return win as unknown as FakeWindow & { history: { replaceState: ReturnType<typeof vi.fn> } };
};

const seeded = (seed: Seed) => SEED_PREFIX + encodeSeed(seed);

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('installFrameStorage', () => {
	it('does nothing without a seed', () => {
		const win = fakeFrame({ hash: '#/some/route' });
		expect(installFrameStorage(win)).toBeUndefined();
		expect(win.localStorage).toBeUndefined();
	});

	it('does nothing when the page is not framed', () => {
		const win = fakeFrame({ hash: seeded({ v: 1, o: 'https://host.example', l: { a: '1' } }), topLevel: true });
		expect(installFrameStorage(win)).toBeUndefined();
		expect(win.localStorage).toBeUndefined();
	});

	it('serves the seeded items', () => {
		const win = fakeFrame({ hash: seeded({ v: 1, o: 'https://host.example', l: { store: '{"a":1}' }, s: { sid: 'abc' } }) });
		installFrameStorage(win);

		expect(win.localStorage.getItem('store')).toBe('{"a":1}');
		expect(win.sessionStorage.getItem('sid')).toBe('abc');
		expect(win.localStorage.getItem('missing')).toBeNull();
		expect(win.localStorage.length).toBe(1);
		expect(win.localStorage.key(0)).toBe('store');
		expect(win.localStorage.key(1)).toBeNull();
	});

	it('reports writes to the host origin only', () => {
		const win = fakeFrame({ hash: seeded({ v: 1, o: 'https://host.example' }) });
		installFrameStorage(win);

		win.localStorage.setItem('a', 'x');
		win.sessionStorage.setItem('b', 'y');
		win.localStorage.removeItem('a');
		win.localStorage.removeItem('never-set');
		win.sessionStorage.clear();
		win.localStorage.clear();

		const messages = win.parent.postMessage.mock.calls;
		expect(messages).toEqual([
			[{ type: '321bridge', v: 1, area: 'local', op: 'set', key: 'a', value: 'x' }, 'https://host.example'],
			[{ type: '321bridge', v: 1, area: 'session', op: 'set', key: 'b', value: 'y' }, 'https://host.example'],
			[{ type: '321bridge', v: 1, area: 'local', op: 'remove', key: 'a' }, 'https://host.example'],
			[{ type: '321bridge', v: 1, area: 'session', op: 'clear' }, 'https://host.example'],
		]);
	});

	it('stores values as strings, like Storage', () => {
		const win = fakeFrame({ hash: seeded({ v: 1, o: 'https://host.example' }) });
		installFrameStorage(win);

		win.localStorage.setItem('n', 42 as unknown as string);
		expect(win.localStorage.getItem('n')).toBe('42');
	});

	it('falls back to the ancestor origin when the seed is unreadable', () => {
		const win = fakeFrame({ hash: `${SEED_PREFIX}garbage`, ancestorOrigins: ['https://dealer.example'] });
		expect(installFrameStorage(win)).toBeDefined();

		win.localStorage.setItem('a', 'b');
		expect(win.parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ key: 'a' }), 'https://dealer.example');
	});

	it('falls back to the referrer origin', () => {
		const win = fakeFrame({ hash: `${SEED_PREFIX}garbage`, referrer: 'https://dealer.example/cars?id=1' });
		installFrameStorage(win);

		win.localStorage.setItem('a', 'b');
		expect(win.parent.postMessage).toHaveBeenCalledWith(expect.anything(), 'https://dealer.example');
	});

	it('keeps working in memory, without posting, when the host origin is unknown', () => {
		const win = fakeFrame({ hash: `${SEED_PREFIX}garbage` });
		installFrameStorage(win);

		win.localStorage.setItem('a', 'b');
		expect(win.localStorage.getItem('a')).toBe('b');
		expect(win.parent.postMessage).not.toHaveBeenCalled();
	});

	it('keeps its own URL current so a reload starts from the latest state', () => {
		const win = fakeFrame({ hash: seeded({ v: 1, o: 'https://host.example', l: { a: '1' } }) });
		installFrameStorage(win);

		win.localStorage.setItem('b', '2');
		win.sessionStorage.setItem('c', '3');
		expect(win.history.replaceState).not.toHaveBeenCalled();

		vi.runAllTimers();
		expect(win.history.replaceState).toHaveBeenCalledTimes(1);
		expect(decodeSeed(win.location.hash.slice(SEED_PREFIX.length))).toEqual({
			v: 1,
			o: 'https://host.example',
			l: { a: '1', b: '2' },
			s: { c: '3' },
		});
	});
});
