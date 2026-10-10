// The design tokens of Benar. `tailwind.config.js` loads this preset, and
// `src/renderer/style.css` loads that config with `@config`.
export default {
  theme: {
    extend: {
      colors: {
        chrome: '#1B1E24',
        panel: { DEFAULT: '#242830', 2: '#2E333C' },
        field: '#15181D',
        line: { DEFAULT: '#343A45', strong: '#3F4652' },
        ink: { DEFAULT: '#E8EAEE', muted: '#A3ABB8', faint: '#6B7482' },
        accent: { DEFAULT: '#6D9BF5', hover: '#8FB3FF', text: '#8FB3FF', ink: '#1B1E24' },
        danger: { DEFAULT: '#E2574A', soft: '#2A1F1E', line: '#5A2E29', text: '#F5A69D' },
        warn: { soft: '#3F3214', line: '#5A4A1E', text: '#F2C565' },
        ok: { soft: '#1F3D2C', line: '#2E6B45', text: '#8FD3A6' },
        info: { soft: '#1E2A40', line: '#2B4070', text: '#B5CDFF' },
      },
      fontFamily: {
        sans: ['"Manrope Variable"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        h1: ['18px', { lineHeight: '1.3', fontWeight: '800' }],
        h2: ['15px', { lineHeight: '1.35', fontWeight: '700' }],
        body: ['14px', { lineHeight: '1.5' }],
        sm: ['13px', { lineHeight: '1.45' }],
        xs: ['12px', { lineHeight: '1.4' }],
        overline: ['11px', { lineHeight: '1.3', fontWeight: '700', letterSpacing: '0.06em' }],
      },
      borderRadius: {
        chip: '4px',
        control: '6px',
        button: '8px',
        card: '12px',
        dialog: '14px',
      },
      boxShadow: {
        dialog: '0 20px 50px rgba(0,0,0,0.45)',
      },
    },
  },
};
