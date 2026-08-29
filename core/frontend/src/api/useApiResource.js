import { useState, useEffect, useCallback } from "react";
import { api, ApiError } from "./client";
import { keysToCamel, keysToSnake } from "./caseConvert";

/**
 * Loads a list resource on mount and exposes CRUD helpers.
 * All data is camelCase on the frontend; converted to snake_case for the API
 * and back to camelCase for state, so components can use the same field
 * names (prepMins, parLevel, lastService, ...) as before.
 *
 * create/update return { ok:true, data } or { ok:false, error, fieldErrors }
 * where fieldErrors is camelCase, ready to spread into a form's error state.
 */
export function useApiResource(path) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get(path);
      setData(keysToCamel(res || []));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  // Fetch on mount / when `path` changes — the standard data-fetching-in-effect
  // pattern. set-state-in-effect flags this; it's intentional here.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refetch(); }, [refetch]);

  const create = async (item) => {
    try {
      const res = await api.post(path, keysToSnake(item));
      const created = keysToCamel(res);
      setData(prev => [...prev, created]);
      return { ok: true, data: created };
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        return { ok: false, error: e.message, fieldErrors: keysToCamel(e.fieldErrors) };
      }
      return { ok: false, error: e.message };
    }
  };

  const update = async (id, item) => {
    try {
      const res = await api.put(`${path}/${id}`, keysToSnake(item));
      const updated = keysToCamel(res);
      setData(prev => prev.map(x => (x.id === id ? updated : x)));
      return { ok: true, data: updated };
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        return { ok: false, error: e.message, fieldErrors: keysToCamel(e.fieldErrors) };
      }
      return { ok: false, error: e.message };
    }
  };

  const remove = async (id) => {
    try {
      await api.del(`${path}/${id}`);
      setData(prev => prev.filter(x => x.id !== id));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  return { data, setData, loading, error, refetch, create, update, remove };
}
