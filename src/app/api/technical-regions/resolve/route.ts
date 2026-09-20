import { getPlatformSession } from "@/lib/auth/session";
import { resolveTechnicalRegionsForLocation } from "@/lib/repositories/agronomic-profiles";

export async function GET(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const url = new URL(request.url);
  const countryCode = url.searchParams.get("countryCode") ?? "BR";
  const stateCode = url.searchParams.get("stateCode");
  const municipalityCode = url.searchParams.get("municipalityCode");
  const latitudeRaw = url.searchParams.get("latitude");
  const longitudeRaw = url.searchParams.get("longitude");
  const atDate = url.searchParams.get("atDate");

  const latitude = latitudeRaw == null || latitudeRaw === "" ? null : Number(latitudeRaw);
  const longitude = longitudeRaw == null || longitudeRaw === "" ? null : Number(longitudeRaw);

  if (latitude != null && !Number.isFinite(latitude)) {
    return Response.json({ error: "Latitude inválida." }, { status: 400 });
  }
  if (longitude != null && !Number.isFinite(longitude)) {
    return Response.json({ error: "Longitude inválida." }, { status: 400 });
  }
  if ((latitude == null) !== (longitude == null)) {
    return Response.json({ error: "Latitude e longitude devem ser informadas juntas." }, { status: 400 });
  }

  const technicalRegions = await resolveTechnicalRegionsForLocation({
    tenantId: session.tenantId,
    userId: session.userId,
    countryCode,
    stateCode,
    municipalityCode,
    latitude,
    longitude,
    atDate,
  });

  return Response.json({
    location: {
      countryCode: countryCode.toUpperCase(),
      stateCode: stateCode?.toUpperCase() ?? null,
      municipalityCode,
      hasCoordinates: latitude != null && longitude != null,
    },
    technicalRegions,
  });
}
