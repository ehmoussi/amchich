import React from "react";

export function useMounted() {
    const isMountedRef = React.useRef<boolean>(true);

    React.useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; }
    }, []);

    return React.useCallback((): boolean => {
        return isMountedRef.current;
    }, []);
}