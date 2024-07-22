module.exports = {
    testEnvironment: "node",
    testMatch: ["**/__tests__/**/*.js", "**/?(*.)+(spec|test).js"],
    moduleFileExtensions: ["js", "json", "jsx", "node"],
    collectCoverage: true,
    verbose: true,
    transform: {
        "\\.[j]sx?$": "babel-jest",
    }
};
