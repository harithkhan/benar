import { expect, test } from 'vitest';

import preset from '../tailwind.preset.js';

test('the preset holds the chrome colour', () => {
  expect(preset.theme.extend.colors.chrome).toBe('#1B1E24');
});
