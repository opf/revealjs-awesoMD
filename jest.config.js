module.exports = {
    testEnvironment: 'jsdom',
    testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
    moduleFileExtensions: ['js', 'json', 'jsx', 'node'],
    collectCoverage: true,
    verbose: true,
    transform: {
        '\\.[j]sx?$': 'babel-jest',
    },
}
