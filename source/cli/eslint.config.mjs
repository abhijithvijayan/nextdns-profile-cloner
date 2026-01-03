import nodeConfig from '@abhijithvijayan/eslint-config/node';
import tsConfig from '@abhijithvijayan/eslint-config/typescript';

export default [
	{
		ignores: ['node_modules/**', 'lib/**', '*.js', '*.mjs'],
	},
	...nodeConfig({
		files: ['**/*.ts'],
	}),
	...tsConfig({
		files: ['**/*.ts'],
	}),
	{
		files: ['**/*.ts'],
		rules: {
			'no-console': 'off',
			'@typescript-eslint/no-use-before-define': 'warn',
			'@typescript-eslint/no-explicit-any': 'warn',
			'import-x/no-duplicates': 'off',
			// fetch is stable in Node 20+, ignore the experimental warning
			'n/no-unsupported-features/node-builtins': [
				'error',
				{
					ignores: ['fetch'],
				},
			],
			// CLI apps commonly use process.exit()
			'n/no-process-exit': 'off',
		},
	},
	{
		files: ['**/__tests__/**/*.ts'],
		rules: {
			// Test files don't need explicit return types
			'@typescript-eslint/explicit-function-return-type': 'off',
			// Jest globals are available via @jest/globals
			'n/no-extraneous-import': 'off',
		},
	},
];
