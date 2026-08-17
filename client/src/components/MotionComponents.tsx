import React from 'react';
import { motion } from 'framer-motion';

/**
 * Premium interface primitives shared by the Nexus exchange experience.
 * They retain the original component APIs while applying the global semantic system.
 */

interface PremiumButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  children: React.ReactNode;
  className?: string;
}

interface PremiumCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: 'lift' | 'glow' | 'scale' | 'border';
}

export const PremiumButton: React.FC<PremiumButtonProps> = ({
  variant = 'primary',
  children,
  className = '',
  type = 'button',
  ...props
}) => {
  const baseClasses = 'relative inline-flex min-h-10 items-center justify-center overflow-hidden rounded-xl font-semibold transition-transform duration-200 active:scale-[0.97] focus-visible:outline-none';
  const variantClasses = {
    primary: 'bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-[0_10px_24px_rgba(59,130,246,0.22)]',
    secondary: 'bg-gradient-to-r from-accent to-primary text-primary-foreground shadow-[0_10px_24px_rgba(6,182,212,0.18)]',
    outline: 'border border-border bg-card/40 text-foreground hover:border-border-light hover:bg-background-tertiary',
    ghost: 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
  } as const;

  return (
    <motion.button
      type={type}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      whileHover={{
        scale: 1.02,
      }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      {...(props as any)}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
      {variant === 'primary' && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          initial={{ x: '-100%' }}
          whileHover={{ x: '100%' }}
          transition={{ duration: 0.5 }}
        />
      )}
    </motion.button>
  );
};

export const PremiumCard: React.FC<PremiumCardProps> = ({
  children,
  className = '',
  hoverEffect = 'lift',
  ...props
}) => {
  const hoverVariants = {
    lift: { y: -6 },
    glow: { scale: 1.01 },
    scale: { scale: 1.02 },
    border: { scale: 1.005 },
  };

  return (
    <motion.div
      className={`rounded-2xl border border-border bg-card/70 backdrop-blur-md transition-transform duration-200 ${className}`}
      whileHover={hoverVariants[hoverEffect]}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      {...(props as any)}
    >
      {children}
    </motion.div>
  );
};

interface PremiumInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const PremiumInput: React.FC<PremiumInputProps> = ({
  label,
  className = '',
  id,
  onFocus,
  onBlur,
  ...props
}) => {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  return (
    <motion.div className="relative">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-2 block text-sm font-medium text-foreground-secondary"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full rounded-xl border border-input-border bg-input px-4 py-3 text-foreground placeholder:text-foreground-tertiary focus:border-primary focus:ring-2 focus:ring-primary/20 focus-visible:outline-none ${className}`}
        onFocus={(event) => {
          onFocus?.(event);
        }}
        onBlur={(event) => {
          onBlur?.(event);
        }}
        {...(props as any)}
      />
    </motion.div>
  );
};

interface PremiumBadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info';
  pulse?: boolean;
}

export const PremiumBadge: React.FC<PremiumBadgeProps> = ({
  children,
  variant = 'info',
  pulse = false,
}) => {
  const variantClasses = {
    success: 'border-success/30 bg-success/15 text-success-light',
    warning: 'border-warning/30 bg-warning/15 text-warning-light',
    error: 'border-danger/30 bg-danger/15 text-danger-light',
    info: 'border-primary/30 bg-primary/15 text-primary-light',
  } as const;

  return (
    <motion.span
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${variantClasses[variant]}`}
      animate={pulse ? { scale: [1, 1.04, 1] } : undefined}
      transition={pulse ? { duration: 2, repeat: Infinity } : undefined}
    >
      {children}
    </motion.span>
  );
};

interface PremiumStatProps {
  label: string;
  value: string | number;
  change?: string;
  icon?: React.ReactNode;
}

export const PremiumStat: React.FC<PremiumStatProps> = ({ label, value, change, icon }) => (
  <PremiumCard hoverEffect="lift" className="p-6">
    <motion.div
      className="flex items-start justify-between gap-4"
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="min-w-0">
        <motion.div className="metric-label mb-2" animate={{ opacity: [0.72, 1, 0.72] }} transition={{ duration: 3, repeat: Infinity }}>
          {label}
        </motion.div>
        <motion.div className="metric-value text-3xl font-bold" initial={{ scale: 0.96 }} whileInView={{ scale: 1 }} transition={{ type: 'spring', stiffness: 180 }}>
          {value}
        </motion.div>
        {change && (
          <motion.div
            className={`mt-2 text-sm font-semibold ${change.includes('+') ? 'status-positive' : 'status-negative'}`}
            animate={{ opacity: [0.75, 1, 0.75] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {change}
          </motion.div>
        )}
      </div>
      {icon && (
        <motion.div className="text-foreground-tertiary" whileHover={{ scale: 1.1 }} transition={{ type: 'spring', stiffness: 400 }}>
          {icon}
        </motion.div>
      )}
    </motion.div>
  </PremiumCard>
);

interface PremiumTableRowProps {
  children: React.ReactNode;
  className?: string;
}

export const PremiumTableRow: React.FC<PremiumTableRowProps> = ({ children, className = '' }) => (
  <motion.tr
    className={`border-b border-border transition-transform hover:bg-background-tertiary ${className}`}
  >
    {children}
  </motion.tr>
);

export const PremiumSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <motion.div
    className={`animate-shimmer rounded-lg bg-background-tertiary ${className}`}
    animate={{ opacity: [0.5, 0.78, 0.5] }}
    transition={{ duration: 1.5, repeat: Infinity }}
  />
);

interface PremiumTooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const PremiumTooltip: React.FC<PremiumTooltipProps> = ({ content, children, position = 'top' }) => {
  const [isVisible, setIsVisible] = React.useState(false);
  const positionVariants = {
    top: { y: -40, x: 0 },
    bottom: { y: 40, x: 0 },
    left: { x: -40, y: 0 },
    right: { x: 40, y: 0 },
  };

  return (
    <div className="relative inline-block">
      <div onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)} onFocus={() => setIsVisible(true)} onBlur={() => setIsVisible(false)}>
        {children}
      </div>
      <motion.div
        role="tooltip"
        aria-hidden={!isVisible}
        className="terminal-panel pointer-events-none absolute z-50 whitespace-nowrap px-3 py-2 text-sm text-foreground"
        initial={{ opacity: 0, ...positionVariants[position] }}
        animate={isVisible ? { opacity: 1, ...positionVariants[position] } : { opacity: 0, ...positionVariants[position] }}
        transition={{ duration: 0.18 }}
      >
        {content}
      </motion.div>
    </div>
  );
};

export const PremiumDivider: React.FC<{ className?: string }> = ({ className = '' }) => (
  <motion.div
    className={`h-px bg-gradient-to-r from-transparent via-border-light to-transparent ${className}`}
    initial={{ scaleX: 0 }}
    whileInView={{ scaleX: 1 }}
    transition={{ duration: 0.45 }}
  />
);

interface PremiumFABProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label?: string;
}

export const PremiumFAB: React.FC<PremiumFABProps> = ({
  icon,
  label,
  className = '',
  type = 'button',
  ...props
}) => (
  <motion.button
    type={type}
    aria-label={label ?? 'Quick action'}
    className={`fixed bottom-8 right-8 flex size-14 items-center justify-center rounded-full bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg transition-transform hover:shadow-2xl focus-visible:outline-none ${className}`}
    whileHover={{ scale: 1.08 }}
    whileTap={{ scale: 0.95 }}
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    {...(props as any)}
  >
    <motion.span animate={{ rotate: [0, 4, -4, 0] }} transition={{ duration: 3, repeat: Infinity }}>
      {icon}
    </motion.span>
  </motion.button>
);
