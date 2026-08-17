import * as React from "react";

export const MOBILE_BREAKPOINT = 768;

export function isMobileViewportWidth(width: number) {
  return width < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== "undefined" ? isMobileViewportWidth(window.innerWidth) : false
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(isMobileViewportWidth(window.innerWidth));
    };
    mql.addEventListener("change", onChange);
    setIsMobile(isMobileViewportWidth(window.innerWidth));
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
