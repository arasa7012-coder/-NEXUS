import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrientation } from '@/hooks/useOrientation';

const gapClassByValue: Record<string, string> = {
  '0': 'gap-0',
  '1': 'gap-1',
  '2': 'gap-2',
  '3': 'gap-3',
  '4': 'gap-4',
  '5': 'gap-5',
  '6': 'gap-6',
  '8': 'gap-8',
  '10': 'gap-10',
  '12': 'gap-12',
};

const gridClassByCount: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

export const resolveGapClass = (gap: string) => gapClassByValue[gap] ?? gapClassByValue['4'];
export const resolveGridClass = (columns: number) => gridClassByCount[columns] ?? gridClassByCount[1];

interface ResponsiveLayoutProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Responsive Layout Container
 * Automatically adapts to portrait and landscape orientations
 */
export const ResponsiveLayout: React.FC<ResponsiveLayoutProps> = ({
  children,
  className = '',
}) => {
  const { isPortrait, isLandscape } = useOrientation();

  return (
    <motion.div
      className={`w-full transition-all duration-300 ${className}`}
      key={isPortrait ? 'portrait' : 'landscape'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
};

interface ResponsiveGridProps {
  children: React.ReactNode;
  portraitCols?: number;
  landscapeCols?: number;
  gap?: string;
  className?: string;
}

/**
 * Responsive Grid that changes columns based on orientation
 */
export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  portraitCols = 1,
  landscapeCols = 2,
  gap = '4',
  className = '',
}) => {
  const { isPortrait } = useOrientation();
  const cols = isPortrait ? portraitCols : landscapeCols;

  return (
    <motion.div
      className={`grid min-w-0 w-full ${resolveGapClass(gap)} ${resolveGridClass(cols)} ${className}`}
      layout
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {children}
    </motion.div>
  );
};

interface ResponsiveFlexProps {
  children: React.ReactNode;
  portraitDirection?: 'row' | 'col';
  landscapeDirection?: 'row' | 'col';
  gap?: string;
  className?: string;
}

/**
 * Responsive Flex that changes direction based on orientation
 */
export const ResponsiveFlex: React.FC<ResponsiveFlexProps> = ({
  children,
  portraitDirection = 'col',
  landscapeDirection = 'row',
  gap = '4',
  className = '',
}) => {
  const { isPortrait } = useOrientation();
  const direction = isPortrait ? portraitDirection : landscapeDirection;
  const directionClass = direction === 'row' ? 'flex-row' : 'flex-col';

  return (
    <motion.div
      className={`flex min-w-0 ${directionClass} w-full ${resolveGapClass(gap)} ${className}`}
      layout
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {children}
    </motion.div>
  );
};

interface ResponsiveContainerProps {
  children: React.ReactNode;
  portraitPadding?: string;
  landscapePadding?: string;
  portraitMaxWidth?: string;
  landscapeMaxWidth?: string;
  className?: string;
}

/**
 * Responsive Container with adaptive padding and max-width
 */
export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  portraitPadding = 'px-4 py-6',
  landscapePadding = 'px-8 py-4',
  portraitMaxWidth = 'max-w-full',
  landscapeMaxWidth = 'max-w-7xl',
  className = '',
}) => {
  const { isPortrait } = useOrientation();
  const padding = isPortrait ? portraitPadding : landscapePadding;
  const maxWidth = isPortrait ? portraitMaxWidth : landscapeMaxWidth;

  return (
    <motion.div
      className={`mx-auto ${maxWidth} ${padding} transition-all duration-300 ${className}`}
      layout
    >
      {children}
    </motion.div>
  );
};

interface ResponsiveSidebarProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  sidebarWidth?: string;
  gap?: string;
  className?: string;
}

/**
 * Responsive Sidebar Layout
 * Shows sidebar beside content in landscape, below in portrait
 */
export const ResponsiveSidebar: React.FC<ResponsiveSidebarProps> = ({
  children,
  sidebar,
  sidebarWidth = 'w-full lg:w-64',
  gap = '6',
  className = '',
}) => {
  const { isPortrait, isLandscape } = useOrientation();

  return (
    <motion.div
      className={`flex min-w-0 ${isPortrait ? 'flex-col' : 'flex-row'} w-full ${resolveGapClass(gap)} ${className}`}
      layout
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <motion.div
        className={isLandscape ? 'flex-1' : 'w-full'}
        layout
      >
        {children}
      </motion.div>
      <motion.div
        className={isPortrait ? 'w-full' : sidebarWidth}
        layout
      >
        {sidebar}
      </motion.div>
    </motion.div>
  );
};

interface ResponsiveHeaderProps {
  children: React.ReactNode;
  portraitStacked?: boolean;
  className?: string;
}

/**
 * Responsive Header that stacks in portrait mode
 */
export const ResponsiveHeader: React.FC<ResponsiveHeaderProps> = ({
  children,
  portraitStacked = true,
  className = '',
}) => {
  const { isPortrait } = useOrientation();

  return (
    <motion.div
      className={`flex ${
        isPortrait && portraitStacked ? 'flex-col' : 'flex-row'
      } items-center justify-between gap-4 w-full ${className}`}
      layout
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {children}
    </motion.div>
  );
};

interface ResponsiveChartProps {
  children: React.ReactNode;
  portraitHeight?: string;
  landscapeHeight?: string;
  className?: string;
}

/**
 * Responsive Chart Container
 * Adjusts height and width based on orientation
 */
export const ResponsiveChart: React.FC<ResponsiveChartProps> = ({
  children,
  portraitHeight = 'h-64',
  landscapeHeight = 'h-80',
  className = '',
}) => {
  const { isPortrait } = useOrientation();
  const height = isPortrait ? portraitHeight : landscapeHeight;

  return (
    <motion.div
      className={`w-full ${height} ${className}`}
      layout
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {children}
    </motion.div>
  );
};

interface ResponsiveTableProps {
  children: React.ReactNode;
  portraitScroll?: boolean;
  className?: string;
}

/**
 * Responsive Table Container
 * Handles overflow in portrait mode
 */
export const ResponsiveTable: React.FC<ResponsiveTableProps> = ({
  children,
  portraitScroll = true,
  className = '',
}) => {
  const { isPortrait } = useOrientation();

  return (
    <motion.div
      className={`w-full overscroll-contain ${
        isPortrait && portraitScroll ? 'overflow-x-auto' : 'overflow-hidden'
      } ${className}`}
      layout
    >
      {children}
    </motion.div>
  );
};

interface ResponsiveButtonGroupProps {
  children: React.ReactNode;
  portraitStacked?: boolean;
  gap?: string;
  className?: string;
}

/**
 * Responsive Button Group
 * Stacks buttons in portrait, arranges horizontally in landscape
 */
export const ResponsiveButtonGroup: React.FC<ResponsiveButtonGroupProps> = ({
  children,
  portraitStacked = true,
  gap = '3',
  className = '',
}) => {
  const { isPortrait } = useOrientation();

  return (
    <motion.div
      className={`flex min-w-0 ${
        isPortrait && portraitStacked ? 'flex-col' : 'flex-row'
      } w-full ${resolveGapClass(gap)} ${className}`}
      layout
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {children}
    </motion.div>
  );
};

interface ResponsiveModalProps {
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  portraitFullWidth?: boolean;
  className?: string;
}

/**
 * Responsive Modal that adapts to screen size
 */
export const ResponsiveModal: React.FC<ResponsiveModalProps> = ({
  children,
  isOpen,
  onClose,
  portraitFullWidth = true,
  className = '',
}) => {
  const { isPortrait } = useOrientation();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={`bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl backdrop-blur-md ${
              isPortrait && portraitFullWidth
                ? 'w-11/12 max-h-[90vh]'
                : 'w-full max-w-2xl max-h-[80vh]'
            } ${className}`}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
