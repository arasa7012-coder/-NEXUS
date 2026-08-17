import { useState, useEffect, useCallback } from 'react';

export type Orientation = 'portrait' | 'landscape';

interface OrientationInfo {
  orientation: Orientation;
  width: number;
  height: number;
  isPortrait: boolean;
  isLandscape: boolean;
  isTablet: boolean;
  isMobile: boolean;
}

/**
 * Hook to detect device orientation and screen size
 * Automatically updates when device is rotated
 */
export const useOrientation = (): OrientationInfo => {
  const [orientationInfo, setOrientationInfo] = useState<OrientationInfo>(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isPortrait = height > width;
    const isLandscape = width > height;
    const isTablet = Math.max(width, height) >= 768;
    const isMobile = Math.max(width, height) < 768;

    return {
      orientation: isPortrait ? 'portrait' : 'landscape',
      width,
      height,
      isPortrait,
      isLandscape,
      isTablet,
      isMobile,
    };
  });

  const updateOrientation = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isPortrait = height > width;
    const isLandscape = width > height;
    const isTablet = Math.max(width, height) >= 768;
    const isMobile = Math.max(width, height) < 768;

    setOrientationInfo({
      orientation: isPortrait ? 'portrait' : 'landscape',
      width,
      height,
      isPortrait,
      isLandscape,
      isTablet,
      isMobile,
    });
  }, []);

  useEffect(() => {
    // Listen to orientation change event
    window.addEventListener('orientationchange', updateOrientation);
    // Also listen to resize for responsive changes
    window.addEventListener('resize', updateOrientation);

    return () => {
      window.removeEventListener('orientationchange', updateOrientation);
      window.removeEventListener('resize', updateOrientation);
    };
  }, [updateOrientation]);

  return orientationInfo;
};

/**
 * Hook to check if device is in portrait mode
 */
export const useIsPortrait = (): boolean => {
  const { isPortrait } = useOrientation();
  return isPortrait;
};

/**
 * Hook to check if device is in landscape mode
 */
export const useIsLandscape = (): boolean => {
  const { isLandscape } = useOrientation();
  return isLandscape;
};

/**
 * Hook to check if device is mobile
 */
export const useIsMobile = (): boolean => {
  const { isMobile } = useOrientation();
  return isMobile;
};

/**
 * Hook to check if device is tablet
 */
export const useIsTablet = (): boolean => {
  const { isTablet } = useOrientation();
  return isTablet;
};
