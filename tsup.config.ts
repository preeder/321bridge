import { defineConfig } from 'tsup';

export default defineConfig([
	{
		entry: { index: 'src/index.ts' },
		format: ['esm', 'cjs'],
		dts: true,
		clean: true,
		target: 'es2020',
	},
	{
		entry: { '321bridge-frame': 'src/frame-script.ts' },
		format: ['iife'],
		outExtension: () => ({ js: '.js' }),
		minify: true,
		target: 'es2020',
	},
	{
		entry: { '321bridge-host': 'src/host.ts' },
		format: ['iife'],
		globalName: 'Bridge321',
		outExtension: () => ({ js: '.js' }),
		minify: true,
		target: 'es2020',
	},
]);
