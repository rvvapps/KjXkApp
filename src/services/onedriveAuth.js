import { getSyncState, saveSyncState } from "../db.js";

// OAuth PKCE for Microsoft identity platform (no backend).
// NOTE: Requires Azure Entra (Azure AD) App Registration configured as SPA.

const GRAPH_SCOPE_APPFOLDER = "Files.ReadWrite.AppFolder";
const GRAPH_SCOPE_FULL = "Files.ReadWrite";

function base64UrlEncode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(str) {
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function randomString(len = 64) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return base64UrlEncode(bytes);
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

export function buildScopes({ mode }) {
  // mode: 'approot' (preferred) or 'folder' fallback
  const graphScope = mode === "folder" ? GRAPH_SCOPE_FULL : GRAPH_SCOPE_APPFOLDER;
  return ["openid", "profile", "offline_access", "User.Read", graphScope];
}

export async function startOneDriveLogin({ tenantId, clientId, mode, redirectUri }) {
  const state = randomString(24);
  const codeVerifier = randomString(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const scopes = buildScopes({ mode }).join(" ");

  await saveSyncState({
    auth: {
      tenantId,
      clientId,
      mode,
      redirectUri,
      pkce: { state, codeVerifier, createdAtSec: nowSec() },
    },
  });

  const authUrl = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  // Optional: force account selection the first time
  // authUrl.searchParams.set("prompt", "select_account");

  window.location.assign(authUrl.toString());
}

export async function handleOneDriveRedirectCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");
  if (error) {
    return { handled: true, ok: false, error, errorDesc };
  }
  if (!code) return { handled: false };

  const st = await getSyncState();
  const auth = st?.auth;
  if (!auth?.pkce?.codeVerifier || !auth?.pkce?.state) {
    return { handled: true, ok: false, error: "missing_pkce" };
  }
  if (returnedState !== auth.pkce.state) {
    return { handled: true, ok: false, error: "state_mismatch" };
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(auth.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams();
  body.set("client_id", auth.clientId);
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", auth.redirectUri);
  body.set("code_verifier", auth.pkce.codeVerifier);
  body.set("scope", buildScopes({ mode: auth.mode }).join(" "));

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { handled: true, ok: false, error: json.error || "token_exchange_failed", errorDesc: json.error_description };
  }

  const expiresAtSec = nowSec() + (json.expires_in || 3600) - 60;
  await saveSyncState({
    auth: {
      ...auth,
      pkce: null,
      connectedAt: new Date().toISOString(),
    },
    token: {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || null,
      expiresAtSec,
      scope: json.scope,
      tokenType: json.token_type,
    },
  });

  // Clean query params to avoid re-processing on refresh
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  url.searchParams.delete("session_state");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  window.history.replaceState({}, document.title, url.toString());

  return { handled: true, ok: true };
}

export async function getValidAccessToken({ allowInteractive = false } = {}) {
  const st = await getSyncState();
  const token = st?.token;
  const auth = st?.auth;
  if (!auth?.tenantId || !auth?.clientId || !auth?.redirectUri) {
    return { ok: false, error: "not_configured" };
  }
  if (token?.accessToken && token?.expiresAtSec && token.expiresAtSec > nowSec()) {
    return { ok: true, accessToken: token.accessToken, mode: auth.mode };
  }
  if (!token?.refreshToken) {
    if (allowInteractive) {
      await startOneDriveLogin({ tenantId: auth.tenantId, clientId: auth.clientId, mode: auth.mode, redirectUri: auth.redirectUri });
    }
    return { ok: false, error: "no_refresh_token" };
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(auth.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams();
  body.set("client_id", auth.clientId);
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", token.refreshToken);
  body.set("redirect_uri", auth.redirectUri);
  body.set("scope", buildScopes({ mode: auth.mode }).join(" "));

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    // If refresh fails, user must login again.
    return { ok: false, error: json.error || "refresh_failed", errorDesc: json.error_description };
  }
  const expiresAtSec = nowSec() + (json.expires_in || 3600) - 60;
  await saveSyncState({
    token: {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || token.refreshToken,
      expiresAtSec,
      scope: json.scope,
      tokenType: json.token_type,
    },
  });
  return { ok: true, accessToken: json.access_token, mode: auth.mode };
}

export async function disconnectOneDrive() {
  const st = await getSyncState();
  await saveSyncState({
    auth: st?.auth ? { ...st.auth, connectedAt: null } : null,
    token: null,
    driveId: null,
    rootFolderItemId: null,
    rootMode: null,
  });
}
