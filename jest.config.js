module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    '*.js',
    'parsers/**/*.js',
    '!jest.config.js',
    '!node_modules/**'
  ]
};
