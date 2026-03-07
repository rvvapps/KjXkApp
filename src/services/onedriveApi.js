import { getValidAccessToken, startOneDriveLogin, buildScopes } from "./onedriveAuth.js";
import { getSyncState, saveSyncState } from "../db.js";

const GRAPH = "https://graph.microsoft.com/v1.0";

async function graphFetch(path, { method = "GET", accessToken, headers = {}, body } = {}) {
  const resp = await fetch(`${GRAPH}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...headers,
    },
    body,
  });
  const text = await resp.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { ok: resp.ok, status: resp.status, json };
}

export async function ensureOneDriveRoot({ preferAppFolder = true } = {}) {
  // Attempts AppFolder first; if not allowed, requests broader scope and uses a dedicated folder.
  const st = await getSyncState();
  const auth = st?.auth;
  if (!auth?.tenantId || !auth?.clientId || !auth?.redirectUri) {
    return { ok: false, error: "not_configured" };
  }

  // 1) Try current mode if already set.
  if (st?.rootMode && st?.driveId && st?.rootFolderItemId) {
    return { ok: true, rootMode: st.rootMode, driveId: st.driveId, rootFolderItemId: st.rootFolderItemId };
  }

  // Helper: set root from a DriveItem
  const setRootFromItem = async (rootMode, item) => {
    const driveId = item?.parentReference?.driveId || item?.driveId || null;
    const rootFolderItemId = item?.id || null;
    await saveSyncState({ rootMode, driveId, rootFolderItemId });
    return { ok: true, rootMode, driveId, rootFolderItemId };
  };

  // 2) Prefer AppFolder
  if (preferAppFolder) {
    // Ensure auth mode is approot
    if (auth.mode !== "approot") {
      await saveSyncState({ auth: { ...auth, mode: "approot" } });
    }
    const tok = await getValidAccessToken({ allowInteractive: true });
    if (!tok.ok) return tok;
    // AppFolder root is special/approot
    const r = await graphFetch(`/me/drive/special/approot`, { accessToken: tok.accessToken });
    if (r.ok) {
      return setRootFromItem("approot", r.json);
    }
    // If forbidden/insufficient privileges, fall through to folder mode.
  }

  // 3) Fallback: dedicated folder under root (requires Files.ReadWrite scope)
  // This needs broader consent; force interactive login with folder scopes.
  const st2 = await getSyncState();
  const auth2 = st2?.auth || auth;
  if (auth2.mode !== "folder") {
    await saveSyncState({ auth: { ...auth2, mode: "folder" } });
  }
  // Trigger interactive if needed
  const tok2 = await getValidAccessToken({ allowInteractive: true });
  if (!tok2.ok) return tok2;

  // Create or find /CajaChica/workspaces/personal
  //  - Create /CajaChica
  //  - Create workspaces
  //  - Create personal
  const ensureChildFolder = async (parentItemId, name) => {
    const list = await graphFetch(`/me/drive/items/${parentItemId}/children?$select=id,name,folder`, { accessToken: tok2.accessToken });
    if (!list.ok) return { ok: false, error: "list_children_failed", detail: list };
    const found = (list.json.value || []).find((x) => x.name === name && x.folder);
    if (found) return { ok: true, item: found };
    const create = await graphFetch(`/me/drive/items/${parentItemId}/children`, {
      method: "POST",
      accessToken: tok2.accessToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
    if (!create.ok) return { ok: false, error: "create_folder_failed", detail: create };
    return { ok: true, item: create.json };
  };

  const root = await graphFetch(`/me/drive/root?$select=id,parentReference,driveId`, { accessToken: tok2.accessToken });
  if (!root.ok) return { ok: false, error: "drive_root_failed", detail: root };
  const rootId = root.json.id;

  const a = await ensureChildFolder(rootId, "CajaChica");
  if (!a.ok) return a;
  const b = await ensureChildFolder(a.item.id, "workspaces");
  if (!b.ok) return b;
  const c = await ensureChildFolder(b.item.id, "personal");
  if (!c.ok) return c;

  // Set root to /CajaChica/workspaces/personal
  return setRootFromItem("folder", c.item);
}

export async function listFilesUnderRoot({ rootMode, rootFolderItemId, relPath }) {
  const tok = await getValidAccessToken({ allowInteractive: false });
  if (!tok.ok) return { ok: false, error: tok.error };
  const safe = relPath.split("/").map((s) => encodeURIComponent(s)).join("/");
  const base = rootMode === "approot"
    ? `/me/drive/special/approot:/${safe}:/children`
    : `/me/drive/items/${rootFolderItemId}:/${safe}:/children`;
  const r = await graphFetch(`${base}?$select=id,name,size,lastModifiedDateTime`, { accessToken: tok.accessToken });
  if (!r.ok) return { ok: false, error: "list_failed", detail: r };
  return { ok: true, files: r.json?.value || [] };
}

export async function getFileUnderRoot({ rootMode, rootFolderItemId, relPath }) {
  const tok = await getValidAccessToken({ allowInteractive: false });
  if (!tok.ok) return { ok: false, error: tok.error };
  const safe = relPath.split("/").map((s) => encodeURIComponent(s)).join("/");
  const url = rootMode === "approot"
    ? `${GRAPH}/me/drive/special/approot:/${safe}:/content`
    : `${GRAPH}/me/drive/items/${rootFolderItemId}:/${safe}:/content`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${tok.accessToken}` },
  });
  if (!resp.ok) return { ok: false, error: "get_failed", status: resp.status };
  const blob = await resp.blob();
  return { ok: true, blob };
}

export async function putFileByPath({ path, contentType, data }) {
  const tok = await getValidAccessToken({ allowInteractive: true });
  if (!tok.ok) return tok;
  // Encode path segments safely, but keep slashes
  const safePath = path.split("/").map((s) => encodeURIComponent(s)).join("/");
  const r = await graphFetch(`/me/drive/special/approot:/${safePath}:/content`, {
    method: "PUT",
    accessToken: tok.accessToken,
    headers: { "Content-Type": contentType },
    body: data,
  });
  return r.ok ? { ok: true, item: r.json } : { ok: false, error: "put_failed", detail: r };
}

export async function putFileUnderRoot({ rootMode, rootFolderItemId, relPath, contentType, data }) {
  const tok = await getValidAccessToken({ allowInteractive: true });
  if (!tok.ok) return tok;
  const safe = relPath.split("/").map((s) => encodeURIComponent(s)).join("/");
  if (rootMode === "approot") {
    const r = await graphFetch(`/me/drive/special/approot:/${safe}:/content`, {
      method: "PUT",
      accessToken: tok.accessToken,
      headers: { "Content-Type": contentType },
      body: data,
    });
    return r.ok ? { ok: true, item: r.json } : { ok: false, error: "put_failed", detail: r };
  }
  // folder mode: upload to specific folder by path relative to that folder
  // Use /items/{rootId}:/{path}:/content
  const r = await graphFetch(`/me/drive/items/${rootFolderItemId}:/${safe}:/content`, {
    method: "PUT",
    accessToken: tok.accessToken,
    headers: { "Content-Type": contentType },
    body: data,
  });
  return r.ok ? { ok: true, item: r.json } : { ok: false, error: "put_failed", detail: r };
}
