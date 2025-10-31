import { createStitches } from '@stitches/react';

export const {
  styled,
  css,
  globalCss,
  keyframes,
  getCssText,
  theme,
  createTheme,
  config,
} = createStitches({
  theme: {
    colors: {
      // Couleurs de base
      white: '#ffffff',
      black: '#000000',
      
      // Couleurs primaires
      primary: '#3b82f6',
      'primary-foreground': '#ffffff',
      
      // Couleurs secondaires
      secondary: '#f3f4f6',
      'secondary-foreground': '#111827',
      
      // Couleurs de fond
      background: '#ffffff',
      foreground: '#111827',
      
      // Couleurs de bordure
      border: '#e5e7eb',
      input: '#9ca3af',
      ring: '#3b82f6',
      
      // Couleurs d'état
      destructive: '#ef4444',
      'destructive-foreground': '#ffffff',
      success: '#10b981',
      warning: '#f59e0b',
      info: '#3b82f6',
      
      // Couleurs de texte
      muted: '#6b7280',
      'muted-foreground': '#6b7280',
      
      // Couleurs d'accent
      accent: '#f3f4f6',
      'accent-foreground': '#111827',
      
      // Couleurs de surbrillance
      highlight: '#f9fafb',
      'highlight-foreground': '#111827',
    },
    radii: {
      none: '0',
      sm: '0.125rem',
      DEFAULT: '0.25rem',
      md: '0.375rem',
      lg: '0.5rem',
      xl: '0.75rem',
      '2xl': '1rem',
      '3xl': '1.5rem',
      full: '9999px',
    },
    space: {
      0: '0',
      1: '0.25rem',
      2: '0.5rem',
      3: '0.75rem',
      4: '1rem',
      5: '1.25rem',
      6: '1.5rem',
      8: '2rem',
      10: '2.5rem',
      12: '3rem',
      16: '4rem',
      20: '5rem',
      24: '6rem',
      32: '8rem',
      40: '10rem',
      48: '12rem',
      56: '14rem',
      64: '16rem',
    },
    fontSizes: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem',
      '5xl': '3rem',
      '6xl': '3.75rem',
    },
    fontWeights: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
    lineHeights: {
      none: '1',
      tight: '1.25',
      snug: '1.375',
      normal: '1.5',
      relaxed: '1.625',
      loose: '2',
    },
    shadows: {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
      none: 'none',
    },
    zIndices: {
      auto: 'auto',
      0: '0',
      10: '10',
      20: '20',
      30: '30',
      40: '40',
      50: '50',
    },
  },
  media: {
    sm: '(min-width: 640px)',
    md: '(min-width: 768px)',
    lg: '(min-width: 1024px)',
    xl: '(min-width: 1280px)',
    '2xl': '(min-width: 1536px)',
    motion: '(prefers-reduced-motion: no-preference)',
    hover: '(hover: hover)',
    dark: '(prefers-color-scheme: dark)',
    light: '(prefers-color-scheme: light)',
  },
  utils: {
    // Utilitaires pour les marges et paddings
    m: (value: string | number) => ({
      margin: value,
    }),
    mt: (value: string | number) => ({
      marginTop: value,
    }),
    mr: (value: string | number) => ({
      marginRight: value,
    }),
    mb: (value: string | number) => ({
      marginBottom: value,
    }),
    ml: (value: string | number) => ({
      marginLeft: value,
    }),
    mx: (value: string | number) => ({
      marginLeft: value,
      marginRight: value,
    }),
    my: (value: string | number) => ({
      marginTop: value,
      marginBottom: value,
    }),
    p: (value: string | number) => ({
      padding: value,
    }),
    pt: (value: string | number) => ({
      paddingTop: value,
    }),
    pr: (value: string | number) => ({
      paddingRight: value,
    }),
    pb: (value: string | number) => ({
      paddingBottom: value,
    }),
    pl: (value: string | number) => ({
      paddingLeft: value,
    }),
    px: (value: string | number) => ({
      paddingLeft: value,
      paddingRight: value,
    }),
    py: (value: string | number) => ({
      paddingTop: value,
      paddingBottom: value,
    }),
    // Utilitaires pour les dimensions
    size: (value: string | number) => ({
      width: value,
      height: value,
    }),
    // Utilitaire pour le radius
    br: (value: string | number) => ({
      borderRadius: value,
    }),
  },
});

// Styles globaux
export const globalStyles = globalCss({
  ':root': {
    '--primary': 'hsl(221, 83%, 53%)',
    '--primary-foreground': 'hsl(0, 0%, 100%)',
    '--background': 'hsl(0, 0%, 100%)',
    '--foreground': 'hsl(222.2, 84%, 4.9%)',
    '--muted': 'hsl(210, 40%, 96.1%)',
    '--muted-foreground': 'hsl(215.4, 16.3%, 46.9%)',
    '--border': 'hsl(214.3, 31.8%, 91.4%)',
    '--input': 'hsl(214.3, 31.8%, 91.4%)',
    '--ring': 'hsl(221.2, 83.2%, 53.3%)',
  },
  '.dark': {
    '--primary': 'hsl(217.2, 91.2%, 59.8%)',
    '--primary-foreground': 'hsl(210, 40%, 98%)',
    '--background': 'hsl(222.2, 84%, 4.9%)',
    '--foreground': 'hsl(210, 40%, 98%)',
    '--muted': 'hsl(217.2, 32.6%, 17.5%)',
    '--muted-foreground': 'hsl(215, 20.2%, 65.1%)',
    '--border': 'hsl(217.2, 32.6%, 17.5%)',
    '--input': 'hsl(217.2, 32.6%, 17.5%)',
    '--ring': 'hsl(224.3, 76.3%, 48%)',
  },
  '*': {
    margin: 0,
    padding: 0,
    boxSizing: 'border-box',
  },
  'html, body': {
    height: '100%',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
  },
  'a, button': {
    cursor: 'pointer',
  },
  'button:focus, a:focus': {
    outline: '2px solid var(--ring)',
    outlineOffset: '2px',
  },
  'h1, h2, h3, h4, h5, h6': {
    fontWeight: 600,
    lineHeight: 1.2,
    color: 'var(--foreground)',
  },
  p: {
    marginBottom: '1rem',
    lineHeight: 1.6,
  },
  'input, button, textarea, select': {
    font: 'inherit',
  },
});

// Appliquer les styles globaux
globalStyles();
