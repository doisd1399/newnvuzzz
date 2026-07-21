export type RegistrationImageRecord = Record<string, unknown> | null | undefined;

const firstImageSource = (values: unknown[]): string => {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (!normalized) continue;
    if (
      normalized.startsWith("data:image/") ||
      normalized.startsWith("https://") ||
      normalized.startsWith("http://")
    ) {
      return normalized;
    }
  }

  return "";
};

export const resolveRegistrationCompanyLogo = (
  registration: RegistrationImageRecord,
): string =>
  firstImageSource([
    registration?.companyLogoURL,
    registration?.companyLogoUrl,
    registration?.logoUrl,
    registration?.logoURL,
    registration?.companyLogo,
    registration?.logo,
  ]);

export const resolveRegistrationOwnerPhoto = (
  registration: RegistrationImageRecord,
): string =>
  firstImageSource([
    registration?.ownerPhotoUrl,
    registration?.ownerPhotoURL,
    registration?.ownerPhoto,
    registration?.profilePhotoURL,
    registration?.applicationPhotoURL,
    registration?.photoURL,
    registration?.photoUrl,
  ]);

export const normalizeRegistrationImages = <T extends Record<string, unknown>>(
  registration: T,
): T & { companyLogoURL: string; ownerPhotoUrl: string } => ({
  ...registration,
  companyLogoURL: resolveRegistrationCompanyLogo(registration),
  ownerPhotoUrl: resolveRegistrationOwnerPhoto(registration),
});
