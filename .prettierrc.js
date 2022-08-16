module.exports = {
  singleQuote: false,
  bracketSpacing: true,
  printWidth: 120,
  overrides: [
    {
      files: "*.sol",
      options: {
        printWidth: 120,
        tabWidth: 4,
        singleQuote: false,
        explicitTypes: "always",
      },
    },
  ],
  plugins: [require.resolve("prettier-plugin-solidity")],
};
