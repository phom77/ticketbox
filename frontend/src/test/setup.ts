import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { selectLanguage } from '../i18n';

// Render with the English catalogs so tests can query visible labels.
await selectLanguage('en');

afterEach(() => cleanup());
