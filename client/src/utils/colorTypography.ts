/**
 * Color & Typography System
 * Comprehensive utilities for applying the premium fintech design system
 */

// Color Palette
export const colors = {
  // Primary
  primary: '#3B82F6',
  primaryLight: '#60A5FA',
  primaryDark: '#1E40AF',
  
  // Secondary
  secondary: '#8B5CF6',
  secondaryLight: '#A78BFA',
  
  // Success
  success: '#10B981',
  successLight: '#34D399',
  successDark: '#059669',
  
  // Danger
  danger: '#EF4444',
  dangerLight: '#F87171',
  dangerDark: '#DC2626',
  
  // Warning
  warning: '#F59E0B',
  warningLight: '#FBBF24',
  
  // Neutral
  background: '#0A0E27',
  backgroundSecondary: '#1A1F3A',
  backgroundTertiary: '#252D48',
  
  // Text
  foreground: '#FFFFFF',
  foregroundSecondary: '#A0AEC0',
  foregroundTertiary: '#718096',
  
  // Borders
  border: '#2D3748',
  borderLight: '#4B5563',
};

// Typography Sizes
export const typography = {
  h1: {
    size: '3rem', // 48px
    weight: 700,
    lineHeight: 1.2,
    letterSpacing: '-0.02em',
  },
  h2: {
    size: '2.5rem', // 40px
    weight: 700,
    lineHeight: 1.3,
    letterSpacing: '-0.01em',
  },
  h3: {
    size: '2rem', // 32px
    weight: 600,
    lineHeight: 1.4,
    letterSpacing: '-0.005em',
  },
  h4: {
    size: '1.5rem', // 24px
    weight: 600,
    lineHeight: 1.5,
    letterSpacing: 0,
  },
  h5: {
    size: '1.25rem', // 20px
    weight: 500,
    lineHeight: 1.5,
    letterSpacing: 0,
  },
  h6: {
    size: '1rem', // 16px
    weight: 500,
    lineHeight: 1.6,
    letterSpacing: '0.01em',
  },
  body: {
    size: '1rem', // 16px
    weight: 400,
    lineHeight: 1.6,
    letterSpacing: '0.005em',
  },
  bodySmall: {
    size: '0.875rem', // 14px
    weight: 400,
    lineHeight: 1.6,
    letterSpacing: '0.01em',
  },
  caption: {
    size: '0.75rem', // 12px
    weight: 400,
    lineHeight: 1.5,
    letterSpacing: '0.02em',
  },
  label: {
    size: '0.875rem', // 14px
    weight: 500,
    lineHeight: 1.5,
    letterSpacing: '0.01em',
  },
};

// Tailwind Classes for Typography
export const typographyClasses = {
  h1: 'text-4xl md:text-5xl font-bold tracking-tight',
  h2: 'text-3xl md:text-4xl font-bold tracking-tight',
  h3: 'text-2xl md:text-3xl font-semibold tracking-tight',
  h4: 'text-xl md:text-2xl font-semibold tracking-tight',
  h5: 'text-lg font-semibold tracking-tight',
  h6: 'text-base font-semibold tracking-tight',
  body: 'text-base leading-relaxed',
  bodySmall: 'text-sm leading-relaxed',
  caption: 'text-xs leading-tight',
  label: 'text-sm font-medium leading-relaxed',
};

// Color Classes
export const colorClasses = {
  // Text Colors
  textPrimary: 'text-foreground',
  textSecondary: 'text-foreground-secondary',
  textTertiary: 'text-foreground-tertiary',
  textMuted: 'text-muted-foreground',
  
  // Background Colors
  bgPrimary: 'bg-background',
  bgSecondary: 'bg-background-secondary',
  bgTertiary: 'bg-background-tertiary',
  bgCard: 'bg-card',
  
  // Accent Colors
  textAccent: 'text-primary',
  textSuccess: 'text-success',
  textDanger: 'text-danger',
  textWarning: 'text-warning',
  
  // Borders
  borderDefault: 'border-border',
  borderLight: 'border-border-light',
};

// Spacing System (8px base grid)
export const spacing = {
  xs: '0.25rem', // 4px
  sm: '0.5rem', // 8px
  md: '0.75rem', // 12px
  lg: '1rem', // 16px
  xl: '1.5rem', // 24px
  '2xl': '2rem', // 32px
  '3xl': '3rem', // 48px
  '4xl': '4rem', // 64px
};

// Shadow System
export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
};

// Gradient Utilities
export const gradients = {
  primary: 'from-primary to-secondary',
  accent: 'from-secondary to-accent',
  success: 'from-success to-success-light',
  danger: 'from-danger to-danger-light',
  warning: 'from-warning to-warning-light',
};

// Component Classes
export const componentClasses = {
  // Cards
  card: 'rounded-xl border border-border bg-card/50 backdrop-blur-md shadow-lg hover:shadow-xl transition-transform duration-300',
  cardHover: 'hover:border-border-light hover:shadow-xl hover:translate-y-[-2px]',
  
  // Buttons
  buttonPrimary: 'px-6 py-3 rounded-lg font-semibold bg-gradient-to-r from-primary to-secondary text-white shadow-lg hover:shadow-xl transition-transform duration-200 hover:translate-y-[-2px]',
  buttonOutline: 'px-6 py-3 rounded-lg font-semibold border border-border bg-transparent text-primary hover:bg-primary/10 transition-transform duration-200',
  buttonSmall: 'px-4 py-2 rounded-lg font-medium',
  
  // Inputs
  input: 'w-full px-4 py-3 rounded-lg border border-input-border bg-input text-foreground placeholder-foreground-tertiary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
  
  // Badges
  badge: 'inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary',
  badgeSuccess: 'inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-success/10 text-success',
  badgeDanger: 'inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-danger/10 text-danger',
  badgeWarning: 'inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-warning/10 text-warning',
};

// Responsive Breakpoints
export const breakpoints = {
  mobile: '640px',
  tablet: '1024px',
  desktop: '1280px',
  wide: '1536px',
};

// Animation Timing
export const timing = {
  fast: '150ms',
  normal: '200ms',
  slow: '300ms',
  slower: '500ms',
};

// Easing Functions
export const easing = {
  easeOut: 'cubic-bezier(0.23, 1, 0.32, 1)',
  easeInOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
  easeIn: 'cubic-bezier(0.42, 0, 1, 1)',
};
