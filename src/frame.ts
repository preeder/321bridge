import type { Area, BridgeMessage, Change, Items, Seed } from './protocol';
import { MESSAGE_TYPE, PROTOCOL_VERSION, SEED_PREFIX, decodeSeed, encodeSeed } from './protocol';

/** How long writes are batched before the frame's own URL is updated to match them. */
const SEED_SYNC_DELAY_MS = 50;

/** A Storage held in memory that reports every change. */
export class BridgedStorage implements Storage {
	[name: string]: any;

	private items: Map<string, string>;

	private onChange: (change: Change) => void;

	constructor(items: Items = {}, onChange: (change: Change) => void = () => undefined) {
		this.items = new Map(Object.entries(items));
		this.onChange = onChange;
	}

	get length(): number {
		return this.items.size;
	}

	key(index: number): string | null {
		return Array.from(this.items.keys())[index] ?? null;
	}

	getItem(key: string): string | null {
		return this.items.get(String(key)) ?? null;
	}

	setItem(key: string, value: string): void {
		const change = { op: 'set', key: String(key), value: String(value) } as const;
		this.items.set(change.key, change.value);
		this.onChange(change);
	}

	removeItem(key: string): void {
		if (this.items.delete(String(key))) {
			this.onChange({ op: 'remove', key: String(key) });
		}
	}

	clear(): void {
		if (this.items.size) {
			this.items.clear();
			this.onChange({ op: 'clear' });
		}
	}

	snapshot(): Items {
		return Object.fromEntries(this.items);
	}
}

/** Origin of the embedding page when the seed did not name one. */
const guessParentOrigin = (win: Window): string | undefined => {
	const ancestor = win.location.ancestorOrigins?.[0];
	if (ancestor && ancestor !== 'null') {
		return ancestor;
	}

	try {
		const { origin } = new URL(win.document.referrer);
		return origin === 'null' ? undefined : origin;
	} catch {
		return undefined;
	}
};

export type FrameBridge = {
	localStorage: BridgedStorage;
	sessionStorage: BridgedStorage;
};

/**
 * Replaces `localStorage` and `sessionStorage` with storage kept by the host page, when the host page
 * asked for it through this frame's URL. Must run before any other script touches storage.
 *
 * Returns the installed storages, or undefined when this frame is not bridged.
 */
export const installFrameStorage = (win: Window = window): FrameBridge | undefined => {
	const { hash } = win.location;
	if (!hash.startsWith(SEED_PREFIX) || win.parent === win) {
		return undefined;
	}

	const seed = decodeSeed(hash.slice(SEED_PREFIX.length));
	const parentOrigin = seed?.o && seed.o !== 'null' ? seed.o : guessParentOrigin(win);

	let syncTimer: ReturnType<typeof setTimeout> | undefined;

	// Keeps this frame's URL carrying the current state, so a reload of the frame starts from it.
	const scheduleSeedSync = () => {
		clearTimeout(syncTimer);
		syncTimer = setTimeout(() => {
			const current: Seed = {
				v: PROTOCOL_VERSION,
				o: parentOrigin ?? '',
				l: bridge.localStorage.snapshot(),
				s: bridge.sessionStorage.snapshot(),
			};
			try {
				win.history.replaceState(win.history.state, '', SEED_PREFIX + encodeSeed(current));
			} catch {
				// A frame that cannot rewrite its URL still works; a reload just starts from the original seed.
			}
		}, SEED_SYNC_DELAY_MS);
	};

	const report = (area: Area) => (change: Change) => {
		if (parentOrigin) {
			const message: BridgeMessage = { type: MESSAGE_TYPE, v: PROTOCOL_VERSION, area, ...change };
			win.parent.postMessage(message, parentOrigin);
		}
		scheduleSeedSync();
	};

	const bridge: FrameBridge = {
		localStorage: new BridgedStorage(seed?.l, report('local')),
		sessionStorage: new BridgedStorage(seed?.s, report('session')),
	};

	Object.defineProperty(win, 'localStorage', { value: bridge.localStorage, configurable: true });
	Object.defineProperty(win, 'sessionStorage', { value: bridge.sessionStorage, configurable: true });

	return bridge;
};
