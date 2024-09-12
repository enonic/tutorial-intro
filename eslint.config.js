const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const jsxA11y = require('eslint-plugin-jsx-a11y');

module.exports = [
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.ts", "**/*.tsx"], // Apply rules to TypeScript files
		plugins: {
			'jsx-a11y': jsxA11y,
		},
		ignores: ["build/**/*.*", "config/*"],

		rules: { // https://eslint.org/docs/rules
			'no-unused-vars': ["warn", { "argsIgnorePattern": "^_" }],
			'@typescript-eslint/no-unused-vars': ["warn", { "argsIgnorePattern": "^_" }]
		},
		settings: {
			react: {
				version: 'detect'
			}
		}
	}
];
