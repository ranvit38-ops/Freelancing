import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

// Next's core web vitals rules over src, as before the move to ESLint 9.
// eslint-config-next 16 also brings the React Compiler rules. Two are kept as
// warnings to work through, not errors, and one does not fit server pages.
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'e2e/**', 'scripts/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  {
    rules: {
      // Server pages wrap their data loading in try/catch to turn a record from
      // another lab into a 404; rendering errors still reach error.tsx.
      'react-hooks/error-boundaries': 'off',
      // Reading localStorage after hydration, and a ref read in render, are
      // deliberate here. Visible as warnings until they are reworked.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
];

export default config;
