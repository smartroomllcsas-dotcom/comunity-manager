const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_NAME_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

export function sessionNameForBrand(brandId: string): string {
  if (!brandId) throw new Error("brand id must not be empty");
  if (!UUID_REGEX.test(brandId)) throw new Error(`brandId must be a valid UUID, got: ${brandId}`);
  return `brand_${brandId.replace(/-/g, "")}`;
}

export function isValidWahaSessionName(name: string): boolean {
  return SESSION_NAME_REGEX.test(name);
}
