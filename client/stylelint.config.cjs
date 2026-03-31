module.exports = {
  rules: {
    'declaration-no-important': [true, { severity: 'warning' }],
    'color-no-invalid-hex': true,
    'selector-class-pattern': [
      '^[a-z][a-zA-Z0-9_-]*$',
      {
        severity: 'warning',
        message: 'Use consistent class naming for Morpheus styling.',
      },
    ],
  },
};
