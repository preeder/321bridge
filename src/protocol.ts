/** Hash prefix that marks a frame URL as carrying a 321bridge seed. */
export const SEED_PREFIX = '#321bridge=';

/** `type` of every message the frame sends to the host page. */
export const MESSAGE_TYPE = '321bridge';

export const PROTOCOL_VERSION = 1;

export type Area = 'local' | 'session';

export type Items = Record<string, string>;

/** The host page's saved storage for one frame, handed to that frame through its URL. */
export type Seed = {
	v: typeof PROTOCOL_VERSION;
	/** Origin of the host page; the frame only posts its writes to this origin. */
	o: string;
	l?: Items;
	s?: Items;
};

export type Change = { op: 'set'; key: string; value: string } | { op: 'remove'; key: string } | { op: 'clear' };

export type BridgeMessage = Change & {
	type: typeof MESSAGE_TYPE;
	v: typeof PROTOCOL_VERSION;
	area: Area;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isItems = (value: unknown): value is Items =>
	isObject(value) && !Array.isArray(value) && Object.values(value).every((item) => typeof item === 'string');

const isSeed = (value: unknown): value is Seed =>
	isObject(value) &&
	value.v === PROTOCOL_VERSION &&
	typeof value.o === 'string' &&
	(value.l === undefined || isItems(value.l)) &&
	(value.s === undefined || isItems(value.s));

export const isBridgeMessage = (value: unknown): value is BridgeMessage => {
	if (!isObject(value) || value.type !== MESSAGE_TYPE || value.v !== PROTOCOL_VERSION) {
		return false;
	}

	if (value.area !== 'local' && value.area !== 'session') {
		return false;
	}

	switch (value.op) {
		case 'set':
			return typeof value.key === 'string' && typeof value.value === 'string';
		case 'remove':
			return typeof value.key === 'string';
		case 'clear':
			return true;
		default:
			return false;
	}
};

/** URL-safe, Unicode-safe text form of a seed. */
export const encodeSeed = (seed: Seed): string => {
	const bytes = new TextEncoder().encode(JSON.stringify(seed));
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Reads a seed back, or returns undefined when the text is not a valid seed. */
export const decodeSeed = (text: string): Seed | undefined => {
	try {
		const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		const seed: unknown = JSON.parse(new TextDecoder().decode(bytes));
		return isSeed(seed) ? seed : undefined;
	} catch {
		return undefined;
	}
};
