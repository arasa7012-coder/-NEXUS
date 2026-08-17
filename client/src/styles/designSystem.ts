// Premium Crypto Exchange - Design System
// Inspired by: Apple, Stripe, Binance, Bybit, OKX, Coinbase, Linear

export const colors = {
  // Primary backgrounds
  bg: {
    primary: '#0A0E27', // Deep Navy
    secondary: '#1A1F3A', // Dark Blue
    tertiary: '#252D48', // Slate Blue
    quaternary: '#2D3654', // Lighter Slate
    hover: '#3A4260', // Hover state
    active: '#4A5270', // Active state
  },

  // Gradients
  gradient: {
    primary: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', // Purple to Pink
    secondary: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', // Pink to Red
    tertiary: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', // Blue to Cyan
    quaternary: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', // Green to Teal
    accent: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', // Pink to Yellow
    dark: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', // Dark gradient
  },

  // Text colors
  text: {
    primary: '#FFFFFF', // White
    secondary: '#A0AEC0', // Light Gray
    tertiary: '#718096', // Medium Gray
    muted: '#4A5568', // Dark Gray
    success: '#10B981', // Green
    warning: '#F59E0B', // Amber
    danger: '#EF4444', // Red
    info: '#3B82F6', // Blue
  },

  // Semantic colors
  semantic: {
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
    positive: '#06B6D4', // Cyan
    negative: '#EC4899', // Pink
  },

  // Glassmorphism
  glass: {
    light: 'rgba(255, 255, 255, 0.05)',
    medium: 'rgba(255, 255, 255, 0.08)',
    dark: 'rgba(255, 255, 255, 0.03)',
  },

  // Borders
  border: {
    light: 'rgba(255, 255, 255, 0.1)',
    medium: 'rgba(255, 255, 255, 0.15)',
    dark: 'rgba(255, 255, 255, 0.05)',
  },
};

export const typography = {
  fontFamily: {
    primary: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", "Courier New", monospace',
  },

  fontSize: {
    xs: '12px',
    sm: '14px',
    base: '16px',
    lg: '18px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '36px',
    '5xl': '48px',
  },

  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },

  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
    loose: 2,
  },

  letterSpacing: {
    tight: '-0.02em',
    normal: '0em',
    wide: '0.02em',
    wider: '0.05em',
  },
};

export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
};

export const shadows = {
  none: 'none',
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  base: '0 4px 12px rgba(0, 0, 0, 0.1)',
  md: '0 8px 24px rgba(0, 0, 0, 0.12)',
  lg: '0 12px 32px rgba(0, 0, 0, 0.15)',
  xl: '0 16px 48px rgba(0, 0, 0, 0.2)',
  '2xl': '0 20px 64px rgba(0, 0, 0, 0.25)',
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
  glow: '0 0 20px rgba(102, 126, 234, 0.4)',
};

export const borderRadius = {
  none: '0px',
  xs: '4px',
  sm: '6px',
  base: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  full: '9999px',
};

export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  slower: '500ms cubic-bezier(0.4, 0, 0.2, 1)',
};

export const zIndex = {
  hide: -1,
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  backdrop: 1040,
  offcanvas: 1050,
  modal: 1060,
  popover: 1070,
  tooltip: 1080,
  notification: 1090,
};

export const breakpoints = {
  xs: '320px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

// Glassmorphism mixin
export const glassmorphism = {
  light: {
    background: 'rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  medium: {
    background: 'rgba(255, 255, 255, 0.08)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
  },
  dark: {
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
};

// Animation presets
export const animations = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.3 },
  },
  slideInUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4 },
  },
  slideInDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4 },
  },
  slideInLeft: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.4 },
  },
  slideInRight: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.4 },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.3 },
  },
};
