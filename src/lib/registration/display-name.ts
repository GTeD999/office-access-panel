export function resolveDisplayName(input: {
  displayName?: string;
  firstName?: string;
  lastName?: string;
}): string | undefined {
  const explicit = input.displayName?.trim();
  if (explicit) return explicit;

  const parts: string[] = [];
  if (input.lastName) parts.push(input.lastName);
  if (input.firstName) parts.push(input.firstName);
  const composed = parts.join(" ").trim();
  return composed.length > 0 ? composed : undefined;
}
