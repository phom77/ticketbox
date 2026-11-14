import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
/* eslint-disable react-refresh/only-export-components */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { setRequestOrganization } from '../../api/client';
import {
  getOrganizationMemberships,
  type OrganizationGrant,
  type OrganizationMembership,
} from '../../api/organizations';
import { useAuth } from '../auth/AuthContext';

type OrganizationContextValue = {
  memberships: OrganizationMembership[];
  selected: OrganizationMembership | undefined;
  loading: boolean;
  error: string;
  choose: (id: string) => void;
  reload: (preferred?: string) => Promise<void>;
};

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  useTranslation();
  const { user } = useAuth();
  const storageKey = `ticketbox.organization.${user?.id}`;
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [selectedId, setSelectedId] = useState(() => sessionStorage.getItem(storageKey) ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const selected = memberships.find((membership) => membership.id === selectedId);

  const reload = useCallback(async (preferred?: string) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError('');
    try {
      const next = await getOrganizationMemberships(controller.signal);
      if (controller.signal.aborted) return;
      const wanted = preferred ?? sessionStorage.getItem(storageKey);
      const id = next.find((organization) => organization.id === wanted)?.id ?? next[0]?.id ?? '';
      setMemberships(next);
      setSelectedId(id);
      if (id) sessionStorage.setItem(storageKey, id);
      else sessionStorage.removeItem(storageKey);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setMemberships([]);
      setError(failure instanceof Error ? failure.message : translate("shared:organizationProvider_khongTheTaiDanhSachToChuc"));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [storageKey]);

  useEffect(() => {
    void reload();
    return () => pending.current?.abort();
  }, [reload]);

  useLayoutEffect(() => {
    setRequestOrganization(selected?.id ?? null);
    return () => setRequestOrganization(null);
  }, [selected?.id]);

  function choose(id: string) {
    if (!memberships.some((membership) => membership.id === id)) return;
    sessionStorage.setItem(storageKey, id);
    setSelectedId(id);
  }

  return (
    <OrganizationContext.Provider value={{ memberships, selected, loading, error, choose, reload }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}

export function RequireOrganizationGrant({
  grant,
  children,
}: { grant: OrganizationGrant; children: ReactNode }) {
  useTranslation();
  const organization = useOrganization();
  if (organization?.loading) return <p role="status">{translate("shared:organizationProvider_dangTaiQuyenCuaToChuc")}</p>;
  if (organization?.selected?.grants.includes(grant)) return <>{children}</>;
  return (
    <div className="admin-empty-state">
      <p role="status">{translate("shared:organizationProvider_toChucDangChonChuaCapQuyen")}</p>
      <Link className="admin-secondary-action" to="/organizer">{translate("shared:organizationProvider_veTongQuanToChuc")}</Link>
    </div>
  );
}
