import { api } from "./client";

/**
 * Calls a server-side AI endpoint (/ai/<endpoint>). The backend builds the
 * prompt and returns parsed JSON directly — no client-side JSON parsing
 * needed. Returns { ok:true, data } or { ok:false, error }.
 */
export async function callAI(endpoint, body = {}) {
  try {
    const data = await api.post(`/ai/${endpoint}`, body);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message || "AI request failed." };
  }
}
