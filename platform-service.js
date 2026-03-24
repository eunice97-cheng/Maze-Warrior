"use strict";

const PLATFORM_PUBLICATION_ACTIVE_STATUSES = ["collecting_representatives", "ready", "scheduled", "live"];
const PLATFORM_REPRESENTATIVE_LOCKED_STATUSES = ["confirmed", "locked"];
const PLATFORM_ADMIN_ROLES = new Set(["captain", "officer"]);

class PlatformError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "PlatformError";
    this.statusCode = Number(options.statusCode) || 500;
    this.code = options.code || "platform_error";
    this.detail = options.detail || null;
  }
}

function normalizeEnv(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeDisplayName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 40);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function createPlatformConfig() {
  const url = normalizeEnv(process.env.SUPABASE_URL).replace(/\/+$/, "");
  const anonKey = normalizeEnv(process.env.SUPABASE_ANON_KEY);
  const serviceRoleKey = normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const configured = Boolean(url && anonKey && serviceRoleKey);
  return Object.freeze({
    url,
    anonKey,
    serviceRoleKey,
    configured,
  });
}

const PLATFORM_CONFIG = createPlatformConfig();

function getPlatformStatusSummary() {
  return {
    configured: PLATFORM_CONFIG.configured,
    urlConfigured: Boolean(PLATFORM_CONFIG.url),
    anonKeyConfigured: Boolean(PLATFORM_CONFIG.anonKey),
    serviceRoleKeyConfigured: Boolean(PLATFORM_CONFIG.serviceRoleKey),
  };
}

function ensurePlatformConfigured() {
  if (!PLATFORM_CONFIG.configured) {
    throw new PlatformError("Supabase platform services are not configured.", {
      statusCode: 503,
      code: "platform_not_configured",
    });
  }
}

function buildSupabaseUrl(pathname, query = {}) {
  const url = new URL(pathname, `${PLATFORM_CONFIG.url}/`);
  Object.entries(query).forEach(([key, value]) => {
    if (value == null || value === "") {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => url.searchParams.append(key, String(entry)));
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url;
}

function buildSupabaseHeaders({ apiKey, bearerToken, prefer, extraHeaders } = {}) {
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${bearerToken || apiKey}`,
  };
  if (prefer) {
    headers.Prefer = prefer;
  }
  if (extraHeaders) {
    Object.assign(headers, extraHeaders);
  }
  return headers;
}

async function parseSupabaseResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

function formatSupabaseError(payload, fallbackStatusCode = 500) {
  if (payload instanceof PlatformError) {
    return payload;
  }
  const message =
    payload?.message ||
    payload?.error_description ||
    payload?.details ||
    payload?.hint ||
    (typeof payload === "string" && payload) ||
    "Supabase request failed.";
  return new PlatformError(message, {
    statusCode: Number(payload?.statusCode) || fallbackStatusCode,
    code: payload?.code || "supabase_request_failed",
    detail: payload?.details || payload?.hint || null,
  });
}

async function supabaseRequest(pathname, options = {}) {
  ensurePlatformConfigured();
  const apiKey = options.apiKey || PLATFORM_CONFIG.anonKey;
  const url = buildSupabaseUrl(pathname, options.query);
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: buildSupabaseHeaders({
      apiKey,
      bearerToken: options.bearerToken,
      prefer: options.prefer,
      extraHeaders:
        options.body === undefined
          ? options.headers
          : {
              "Content-Type": "application/json",
              ...(options.headers || {}),
            },
    }),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await parseSupabaseResponse(response);
  if (!response.ok) {
    throw formatSupabaseError(payload, response.status);
  }
  return payload;
}

function createInFilter(values) {
  return `in.(${values.map((value) => String(value)).join(",")})`;
}

function getAuthorizationHeader(request) {
  const header = request.headers?.authorization;
  return Array.isArray(header) ? header[0] : String(header || "");
}

function getBearerToken(request) {
  const authorization = getAuthorizationHeader(request);
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function getPlatformRedirectUrl() {
  const appBaseUrl = normalizeEnv(process.env.APP_BASE_URL);
  if (!appBaseUrl) {
    return "";
  }
  try {
    const seasonCommandEnabled = String(process.env.MAZE_ENABLE_SEASON_COMMAND || "").toLowerCase() === "true";
    return new URL(seasonCommandEnabled ? "/season" : "/play", appBaseUrl).toString();
  } catch (error) {
    return "";
  }
}

function pickFirstRow(payload) {
  return Array.isArray(payload) ? payload[0] || null : payload || null;
}

async function getAuthUser(accessToken) {
  if (!accessToken) {
    throw new PlatformError("A valid Supabase access token is required.", {
      statusCode: 401,
      code: "missing_access_token",
    });
  }
  return supabaseRequest("/auth/v1/user", {
    apiKey: PLATFORM_CONFIG.anonKey,
    bearerToken: accessToken,
  });
}

async function getPublicRows(table, query = {}) {
  return supabaseRequest(`/rest/v1/${table}`, {
    apiKey: PLATFORM_CONFIG.anonKey,
    query,
  });
}

async function getServiceRows(table, query = {}) {
  return supabaseRequest(`/rest/v1/${table}`, {
    apiKey: PLATFORM_CONFIG.serviceRoleKey,
    bearerToken: PLATFORM_CONFIG.serviceRoleKey,
    query,
  });
}

async function insertServiceRow(table, body) {
  return supabaseRequest(`/rest/v1/${table}`, {
    method: "POST",
    apiKey: PLATFORM_CONFIG.serviceRoleKey,
    bearerToken: PLATFORM_CONFIG.serviceRoleKey,
    prefer: "return=representation",
    body,
  });
}

async function updateServiceRows(table, query, body) {
  return supabaseRequest(`/rest/v1/${table}`, {
    method: "PATCH",
    apiKey: PLATFORM_CONFIG.serviceRoleKey,
    bearerToken: PLATFORM_CONFIG.serviceRoleKey,
    prefer: "return=representation",
    query,
    body,
  });
}

async function callServiceRpc(name, body) {
  return supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    apiKey: PLATFORM_CONFIG.serviceRoleKey,
    bearerToken: PLATFORM_CONFIG.serviceRoleKey,
    body,
  });
}

async function getProfileById(profileId) {
  if (!profileId) {
    return null;
  }
  const rows = await getServiceRows("profiles", {
    select: "id,display_name,avatar_url,discord_user_id,is_admin,created_at,updated_at",
    id: `eq.${profileId}`,
    limit: 1,
  });
  return pickFirstRow(rows);
}

async function updateProfileById(profileId, patch) {
  if (!profileId || !patch || typeof patch !== "object") {
    return null;
  }
  const rows = await updateServiceRows("profiles", { id: `eq.${profileId}` }, patch);
  return pickFirstRow(rows);
}

async function getClanById(clanId) {
  const rows = await getPublicRows("clans", {
    select: "id,slug,name,direction,summary,accent_color",
    id: `eq.${clanId}`,
    limit: 1,
  });
  return pickFirstRow(rows);
}

async function listClans() {
  return getPublicRows("clans", {
    select: "id,slug,name,direction,summary,accent_color",
    order: "name.asc",
  });
}

async function getCurrentSeason() {
  const seasonSelect = "id,slug,name,description,status,starts_at,ends_at,clan_selection_starts_at,clan_selection_ends_at";
  const activeRows = await getPublicRows("seasons", {
    select: seasonSelect,
    status: "eq.active",
    limit: 1,
  });
  if (activeRows.length) {
    return activeRows[0];
  }

  const upcomingRows = await getPublicRows("seasons", {
    select: seasonSelect,
    status: "eq.upcoming",
    order: "starts_at.asc",
    limit: 1,
  });
  return pickFirstRow(upcomingRows);
}

async function getSeasonById(seasonId) {
  const rows = await getServiceRows("seasons", {
    select: "id,slug,name,description,status,starts_at,ends_at,clan_selection_starts_at,clan_selection_ends_at",
    id: `eq.${seasonId}`,
    limit: 1,
  });
  return pickFirstRow(rows);
}

async function getMembershipForSeason(profileId, seasonId) {
  if (!profileId || !seasonId) {
    return null;
  }
  const rows = await getServiceRows("season_clan_memberships", {
    select: "id,season_id,profile_id,clan_id,role,status,joined_at,left_at",
    profile_id: `eq.${profileId}`,
    season_id: `eq.${seasonId}`,
    limit: 1,
  });
  return pickFirstRow(rows);
}

async function getRepresentativeSlot(publicationId, clanId) {
  const rows = await getServiceRows("maze_representative_slots", {
    select: "id,publication_id,clan_id,profile_id,nomination_id,confirmed_by_profile_id,status,confirmed_at,lock_deadline_at",
    publication_id: `eq.${publicationId}`,
    clan_id: `eq.${clanId}`,
    limit: 1,
  });
  return pickFirstRow(rows);
}

async function getNominationById(nominationId) {
  const rows = await getServiceRows("maze_representative_nominations", {
    select: "id,publication_id,clan_id,profile_id,nominated_by_profile_id,status,note,responded_at,created_at,updated_at",
    id: `eq.${nominationId}`,
    limit: 1,
  });
  return pickFirstRow(rows);
}

async function getNominationForProfile(publicationId, clanId, profileId) {
  const rows = await getServiceRows("maze_representative_nominations", {
    select: "id,publication_id,clan_id,profile_id,nominated_by_profile_id,status,note,responded_at,created_at,updated_at",
    publication_id: `eq.${publicationId}`,
    clan_id: `eq.${clanId}`,
    profile_id: `eq.${profileId}`,
    limit: 1,
  });
  return pickFirstRow(rows);
}

async function getPublicationRows(query) {
  return getPublicRows("maze_publications", {
    select:
      "id,season_id,title,slug,layout_file,short_description,status,published_at,all_clans_locked_at,scheduled_start_at,scheduled_announced_at,live_started_at,finished_at,created_at,updated_at",
    ...query,
  });
}

async function getPublicationById(publicationId) {
  const rows = await getPublicationRows({
    id: `eq.${publicationId}`,
    limit: 1,
  });
  const publication = pickFirstRow(rows);
  if (!publication) {
    return null;
  }
  const [bundle] = await attachRepresentativeData([publication]);
  return bundle || null;
}

async function listCurrentPublications(limit = 5, seasonId = null) {
  const publications = await getPublicationRows({
    status: createInFilter(PLATFORM_PUBLICATION_ACTIVE_STATUSES),
    ...(seasonId ? { season_id: `eq.${seasonId}` } : {}),
    order: "published_at.desc",
    limit,
  });
  return attachRepresentativeData(publications);
}

async function attachRepresentativeData(publications) {
  if (!publications.length) {
    return [];
  }

  const publicationIds = publications.map((publication) => publication.id);
  const slotRows = await getServiceRows("maze_representative_slots", {
    select: "id,publication_id,clan_id,profile_id,nomination_id,status,confirmed_at,lock_deadline_at",
    publication_id: createInFilter(publicationIds),
    order: "clan_id.asc",
  });

  const clanIds = [...new Set(slotRows.map((slot) => slot.clan_id).filter(Boolean))];
  const profileIds = [...new Set(slotRows.map((slot) => slot.profile_id).filter(Boolean))];

  const [clanRows, profileRows] = await Promise.all([
    clanIds.length
      ? getPublicRows("clans", {
          select: "id,slug,name,direction,summary,accent_color",
          id: createInFilter(clanIds),
        })
      : [],
    profileIds.length
      ? getServiceRows("profiles", {
          select: "id,display_name,avatar_url",
          id: createInFilter(profileIds),
        })
      : [],
  ]);

  const clansById = new Map(clanRows.map((clan) => [clan.id, clan]));
  const profilesById = new Map(profileRows.map((profile) => [profile.id, profile]));
  const slotsByPublicationId = new Map();

  slotRows.forEach((slot) => {
    const slots = slotsByPublicationId.get(slot.publication_id) || [];
    slots.push({
      ...slot,
      clan: clansById.get(slot.clan_id) || null,
      representative: slot.profile_id ? profilesById.get(slot.profile_id) || null : null,
    });
    slotsByPublicationId.set(slot.publication_id, slots);
  });

  return publications.map((publication) => {
    const representativeSlots = slotsByPublicationId.get(publication.id) || [];
    const confirmedCount = representativeSlots.filter((slot) =>
      PLATFORM_REPRESENTATIVE_LOCKED_STATUSES.includes(slot.status) && slot.profile_id
    ).length;
    return {
      ...publication,
      representativeSlots,
      clansReady: confirmedCount,
      clansTotal: representativeSlots.length,
      allClansReady: representativeSlots.length > 0 && confirmedCount === representativeSlots.length,
    };
  });
}

async function getAuthenticatedContextFromAccessToken(accessToken) {
  const user = await getAuthUser(accessToken);
  const profile = await getProfileById(user.id);
  if (!profile) {
    throw new PlatformError("The signed-in profile could not be found.", {
      statusCode: 404,
      code: "profile_not_found",
    });
  }
  return {
    accessToken,
    user,
    profile,
  };
}

async function getAuthenticatedContext(request) {
  const accessToken = getBearerToken(request);
  return getAuthenticatedContextFromAccessToken(accessToken);
}

async function buildMyPlatformState(context) {
  const currentSeason = await getCurrentSeason();
  let currentMembership = null;
  let currentClan = null;
  let currentPublication = null;
  let currentRepresentativeSlot = null;
  let myNomination = null;

  if (currentSeason) {
    currentMembership = await getMembershipForSeason(context.user.id, currentSeason.id);
    if (currentMembership?.clan_id) {
      currentClan = await getClanById(currentMembership.clan_id);
    }
    const publications = await listCurrentPublications(1, currentSeason.id);
    currentPublication = publications[0] || null;
    if (currentPublication && currentMembership?.clan_id) {
      currentRepresentativeSlot =
        currentPublication.representativeSlots.find((slot) => slot.clan_id === currentMembership.clan_id) || null;
      myNomination = await getNominationForProfile(currentPublication.id, currentMembership.clan_id, context.user.id);
    }
  }

  return {
    user: {
      id: context.user.id,
      email: context.user.email || "",
    },
    profile: context.profile,
    currentSeason,
    currentMembership,
    currentClan,
    currentPublication,
    currentRepresentativeSlot,
    myNomination,
  };
}

async function getMyPlatformState(request) {
  const context = await getAuthenticatedContext(request);
  return buildMyPlatformState(context);
}

async function getMyPlatformStateForAccessToken(accessToken) {
  const context = await getAuthenticatedContextFromAccessToken(accessToken);
  return buildMyPlatformState(context);
}

async function requestEmailOtp(email, displayName = "") {
  const normalizedEmail = normalizeEmail(email);
  const normalizedDisplayName = normalizeDisplayName(displayName);
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new PlatformError("A valid email address is required.", {
      statusCode: 400,
      code: "email_required",
    });
  }

  const payload = {
    email: normalizedEmail,
    create_user: true,
  };

  if (normalizedDisplayName) {
    payload.data = {
      display_name: normalizedDisplayName,
    };
  }

  const redirectTo = getPlatformRedirectUrl();
  if (redirectTo) {
    payload.redirect_to = redirectTo;
  }

  await supabaseRequest("/auth/v1/otp", {
    method: "POST",
    apiKey: PLATFORM_CONFIG.anonKey,
    body: payload,
  });

  return {
    email: normalizedEmail,
    displayName: normalizedDisplayName,
    redirectTo: redirectTo || null,
  };
}

function normalizeAuthSessionPayload(payload) {
  const session = payload?.session && typeof payload.session === "object" ? payload.session : payload;
  return {
    accessToken: session?.access_token || "",
    refreshToken: session?.refresh_token || "",
    expiresIn: session?.expires_in ?? null,
    expiresAt: session?.expires_at ?? null,
    tokenType: session?.token_type || "bearer",
    user: payload?.user || session?.user || null,
  };
}

async function verifyEmailOtp(payload = {}) {
  const normalizedType = String(payload?.type || "email").trim() || "email";
  const normalizedEmail = normalizeEmail(payload?.email);
  const normalizedToken = String(payload?.token || "").trim();
  const normalizedTokenHash = String(payload?.tokenHash || payload?.token_hash || "").trim();
  const normalizedDisplayName = normalizeDisplayName(payload?.displayName);

  if (!normalizedTokenHash) {
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new PlatformError("An email address is required to verify that sign-in code.", {
        statusCode: 400,
        code: "email_required",
      });
    }
    if (!normalizedToken) {
      throw new PlatformError("A one-time code is required to complete sign-in.", {
        statusCode: 400,
        code: "otp_required",
      });
    }
  }

  const verifyPayload = normalizedTokenHash
    ? {
        token_hash: normalizedTokenHash,
        type: normalizedType,
      }
    : {
        email: normalizedEmail,
        token: normalizedToken,
        type: normalizedType,
      };

  const response = await supabaseRequest("/auth/v1/verify", {
    method: "POST",
    apiKey: PLATFORM_CONFIG.anonKey,
    body: verifyPayload,
  });

  const session = normalizeAuthSessionPayload(response);
  if (!session.accessToken || !session.user?.id) {
    throw new PlatformError("Supabase did not return a usable session.", {
      statusCode: 502,
      code: "invalid_auth_response",
    });
  }

  if (normalizedDisplayName) {
    await updateProfileById(session.user.id, {
      display_name: normalizedDisplayName,
    }).catch(() => null);
  }

  return {
    session,
    state: await getMyPlatformStateForAccessToken(session.accessToken),
  };
}

function ensureSelectionWindowOpen(season) {
  const now = Date.now();
  if (season.clan_selection_starts_at && now < Date.parse(season.clan_selection_starts_at)) {
    throw new PlatformError("Clan selection for this season has not opened yet.", {
      statusCode: 409,
      code: "selection_window_not_open",
    });
  }
  if (season.clan_selection_ends_at && now > Date.parse(season.clan_selection_ends_at)) {
    throw new PlatformError("Clan selection for this season has already closed.", {
      statusCode: 409,
      code: "selection_window_closed",
    });
  }
}

async function joinClanForSeason(request, seasonId, clanId) {
  const context = await getAuthenticatedContext(request);
  const [season, clan] = await Promise.all([getSeasonById(seasonId), getClanById(clanId)]);

  if (!season) {
    throw new PlatformError("Season not found.", { statusCode: 404, code: "season_not_found" });
  }
  if (!clan) {
    throw new PlatformError("Clan not found.", { statusCode: 404, code: "clan_not_found" });
  }
  ensureSelectionWindowOpen(season);

  const existingMembership = await getMembershipForSeason(context.user.id, season.id);
  if (existingMembership) {
    if (existingMembership.clan_id === clan.id) {
      return {
        membership: existingMembership,
        clan,
        season,
        alreadyJoined: true,
      };
    }
    throw new PlatformError("You have already chosen a clan for this season.", {
      statusCode: 409,
      code: "season_clan_locked",
    });
  }

  const rows = await insertServiceRow("season_clan_memberships", {
    season_id: season.id,
    profile_id: context.user.id,
    clan_id: clan.id,
    role: "member",
    status: "active",
  });

  return {
    membership: pickFirstRow(rows),
    clan,
    season,
    alreadyJoined: false,
  };
}

async function volunteerForPublication(request, publicationId, note = "") {
  const context = await getAuthenticatedContext(request);
  const publication = await getPublicationById(publicationId);
  if (!publication) {
    throw new PlatformError("Maze publication not found.", {
      statusCode: 404,
      code: "publication_not_found",
    });
  }
  if (!["collecting_representatives", "ready"].includes(publication.status)) {
    throw new PlatformError("This maze is not currently accepting representatives.", {
      statusCode: 409,
      code: "publication_not_accepting_representatives",
    });
  }

  const membership = await getMembershipForSeason(context.user.id, publication.season_id);
  if (!membership || membership.status !== "active") {
    throw new PlatformError("You must belong to an active clan for this season before volunteering.", {
      statusCode: 409,
      code: "membership_required",
    });
  }

  const slot = publication.representativeSlots.find((entry) => entry.clan_id === membership.clan_id) || null;
  if (slot?.profile_id && slot.profile_id !== context.user.id && PLATFORM_REPRESENTATIVE_LOCKED_STATUSES.includes(slot.status)) {
    throw new PlatformError("Your clan already has a confirmed Marked Bearer for this maze.", {
      statusCode: 409,
      code: "clan_already_represented",
    });
  }

  const trimmedNote = String(note || "").trim().slice(0, 400);
  const existingNomination = await getNominationForProfile(publication.id, membership.clan_id, context.user.id);
  let nomination;

  if (existingNomination) {
    if (["pending", "accepted"].includes(existingNomination.status)) {
      nomination = existingNomination;
    } else {
      const updatedRows = await updateServiceRows(
        "maze_representative_nominations",
        { id: `eq.${existingNomination.id}` },
        {
          status: "pending",
          nominated_by_profile_id: context.user.id,
          note: trimmedNote || null,
        }
      );
      nomination = pickFirstRow(updatedRows);
    }
  } else {
    const insertedRows = await insertServiceRow("maze_representative_nominations", {
      publication_id: publication.id,
      clan_id: membership.clan_id,
      profile_id: context.user.id,
      nominated_by_profile_id: context.user.id,
      status: "pending",
      note: trimmedNote || null,
    });
    nomination = pickFirstRow(insertedRows);
  }

  return {
    publication: await getPublicationById(publication.id),
    membership,
    nomination,
  };
}

async function ensureClanLeadershipForPublication(request, publication, clanId) {
  const context = await getAuthenticatedContext(request);
  if (context.profile.is_admin) {
    return context;
  }

  const membership = await getMembershipForSeason(context.user.id, publication.season_id);
  if (!membership || membership.status !== "active" || membership.clan_id !== clanId || !PLATFORM_ADMIN_ROLES.has(membership.role)) {
    throw new PlatformError("Only a clan captain, officer, or platform admin can confirm this representative.", {
      statusCode: 403,
      code: "insufficient_clan_role",
    });
  }

  return context;
}

async function confirmRepresentative(request, publicationId, nominationId) {
  const publication = await getPublicationById(publicationId);
  if (!publication) {
    throw new PlatformError("Maze publication not found.", {
      statusCode: 404,
      code: "publication_not_found",
    });
  }
  if (!["collecting_representatives", "ready"].includes(publication.status)) {
    throw new PlatformError("Representatives can no longer be changed for this maze publication.", {
      statusCode: 409,
      code: "publication_locked_for_confirmation",
    });
  }

  const nomination = await getNominationById(nominationId);
  if (!nomination || nomination.publication_id !== publication.id) {
    throw new PlatformError("Representative nomination not found for this publication.", {
      statusCode: 404,
      code: "nomination_not_found",
    });
  }

  const actor = await ensureClanLeadershipForPublication(request, publication, nomination.clan_id);
  const slot = await getRepresentativeSlot(publication.id, nomination.clan_id);
  if (!slot) {
    throw new PlatformError("Representative slot not found for that clan.", {
      statusCode: 404,
      code: "representative_slot_not_found",
    });
  }
  if (slot.status === "locked") {
    throw new PlatformError("That clan's representative is already locked for this contest.", {
      statusCode: 409,
      code: "representative_slot_locked",
    });
  }

  await updateServiceRows(
    "maze_representative_nominations",
    {
      publication_id: `eq.${publication.id}`,
      clan_id: `eq.${nomination.clan_id}`,
      id: `neq.${nomination.id}`,
      status: `in.(pending,accepted)`,
    },
    {
      status: "cancelled",
    }
  ).catch(() => null);

  await updateServiceRows(
    "maze_representative_nominations",
    { id: `eq.${nomination.id}` },
    {
      status: "accepted",
      responded_at: new Date().toISOString(),
    }
  );

  const updatedSlotRows = await updateServiceRows(
    "maze_representative_slots",
    {
      publication_id: `eq.${publication.id}`,
      clan_id: `eq.${nomination.clan_id}`,
    },
    {
      profile_id: nomination.profile_id,
      nomination_id: nomination.id,
      confirmed_by_profile_id: actor.user.id,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    }
  );

  return {
    slot: pickFirstRow(updatedSlotRows),
    publication: await getPublicationById(publication.id),
  };
}

async function requireAdminContext(request) {
  const context = await getAuthenticatedContext(request);
  if (!context.profile.is_admin) {
    throw new PlatformError("Only a platform admin can perform that action.", {
      statusCode: 403,
      code: "admin_required",
    });
  }
  return context;
}

async function createMazePublication(request, payload) {
  const admin = await requireAdminContext(request);
  const seasonId = String(payload?.seasonId || "").trim();
  const title = String(payload?.title || "").trim();
  const layoutFile = String(payload?.layoutFile || "").trim();
  const shortDescription = String(payload?.shortDescription || "").trim();
  const providedSlug = String(payload?.slug || "").trim();
  const slug = slugify(providedSlug || title);

  if (!seasonId) {
    throw new PlatformError("A season is required to publish a maze.", {
      statusCode: 400,
      code: "season_id_required",
    });
  }
  if (!title || title.length < 3) {
    throw new PlatformError("A maze title with at least 3 characters is required.", {
      statusCode: 400,
      code: "title_required",
    });
  }
  if (!layoutFile) {
    throw new PlatformError("A layout file is required to publish a maze.", {
      statusCode: 400,
      code: "layout_file_required",
    });
  }
  if (!slug) {
    throw new PlatformError("A valid slug could not be generated for this maze publication.", {
      statusCode: 400,
      code: "invalid_publication_slug",
    });
  }

  const season = await getSeasonById(seasonId);
  if (!season) {
    throw new PlatformError("Season not found.", {
      statusCode: 404,
      code: "season_not_found",
    });
  }

  const insertedRows = await insertServiceRow("maze_publications", {
    season_id: season.id,
    title,
    slug,
    layout_file: layoutFile,
    short_description: shortDescription || null,
    authored_by_profile_id: admin.user.id,
    published_by_profile_id: admin.user.id,
    status: "collecting_representatives",
    published_at: new Date().toISOString(),
  });

  const publication = pickFirstRow(insertedRows);
  return getPublicationById(publication.id);
}

async function schedulePublicationStart(request, publicationId, scheduledStartAt) {
  await requireAdminContext(request);
  if (!scheduledStartAt) {
    throw new PlatformError("A scheduled start time is required.", {
      statusCode: 400,
      code: "scheduled_start_required",
    });
  }
  const scheduledDate = new Date(scheduledStartAt);
  if (Number.isNaN(scheduledDate.getTime())) {
    throw new PlatformError("The scheduled start time must be a valid ISO datetime.", {
      statusCode: 400,
      code: "invalid_scheduled_start",
    });
  }

  await callServiceRpc("schedule_publication_start", {
    p_publication_id: publicationId,
    p_scheduled_start_at: scheduledDate.toISOString(),
  });
  return getPublicationById(publicationId);
}

module.exports = {
  PlatformError,
  getPlatformStatusSummary,
  requestEmailOtp,
  verifyEmailOtp,
  listClans,
  getCurrentSeason,
  listCurrentPublications,
  getPublicationById,
  getMyPlatformState,
  joinClanForSeason,
  volunteerForPublication,
  confirmRepresentative,
  createMazePublication,
  schedulePublicationStart,
};
