import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// False in the server HTML, true once React has hydrated. Forms keep their controls disabled until then,
// so a submit before hydration can't fall back to a native GET (which would put the email in the URL).
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
