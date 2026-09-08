/** sessionStorage key marking this tab as already past the app-lock PIN
 * screen for the current login — cleared on logout (use-logout.ts) so a
 * fresh login in the same tab asks again instead of inheriting the
 * previous session's unlocked state. Set once verify-pin succeeds
 * ((app)/layout.tsx). */
export const PIN_UNLOCKED_KEY = "excavator_pin_unlocked";
