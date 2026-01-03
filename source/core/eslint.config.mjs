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
		},
	},
];
