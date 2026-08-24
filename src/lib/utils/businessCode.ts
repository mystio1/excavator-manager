// Excludes visually-confusable characters (0/O, 1/I/L) since owners read
// this aloud or hand it to operators to type on a phone.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generateBusinessCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export function normalizeBusinessCode(input: string) {
  return input.trim().toUpperCase();
}

// A custom code the owner picks themselves — letters/digits only, no spaces,
// short enough for an operator to type on a phone but not forced to the
// fixed length of an auto-generated one.
export const BUSINESS_CODE_PATTERN = /^[A-Z0-9]{3,20}$/;

export function isValidBusinessCode(code: string) {
  return BUSINESS_CODE_PATTERN.test(normalizeBusinessCode(code));
}
