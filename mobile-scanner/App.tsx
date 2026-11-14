import NetInfo from '@react-native-community/netinfo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import {
  ApiClientError,
  getAccessToken,
  getCheckinHistory,
  getOrCreateDeviceId,
  getStaffConcertOverview,
  getStaffConcerts,
  getStaffTickets,
  getStaffUser,
  getStaffGuestList,
  checkInStaffGuest,
  loginStaff,
  logoutStaff,
} from './src/api';
import type {
  ServerCheckinHistory,
  StaffConcert,
  StaffConcertOverview,
  StaffTicket,
  StaffUser,
  StaffGuestListEntry,
} from './src/api';
import {
  cacheStaffConcerts,
  getDatasetInfo,
  getMetadata,
  listCachedConcerts,
  listLocalCheckinLogs,
  listLocalTickets,
  setMetadata,
} from './src/database';
import type {
  DatasetInfo,
  LocalCheckinLog,
  LocalTicketListItem,
  LogStatusCounts,
} from './src/database';
import {
  EMPTY_LOG_COUNTERS,
  loadCheckinCounters,
  performOnlineCheckin,
} from './src/features/checkin';
import type { ManualCheckinResult } from './src/features/checkin';
import { mergeHistory } from './src/features/checkin/history';
import { downloadCheckinDataset, syncPendingLogs } from './src/features/sync';
import type { PendingSyncSummary } from './src/features/sync';
import {
  BootScreen,
  ConcertDataScreen,
  ConcertListScreen,
  ConcertOverviewScreen,
  GuestListScreen,
  ScanHistoryScreen,
  ScannerHomeScreen,
  StaffLoginScreen,
} from './src/screens';
import { ConcertShell, type ConcertRoute } from './src/ui/ConcertShell';
import { ScannerLanguageProvider, useScannerLanguage, type MessageKey } from './src/i18n';

type Session = { accessToken: string; user: StaffUser };

const SELECTED_CONCERT_KEY = 'scanner:selectedConcertId';
const SELECTED_GATE_KEY = 'scanner:selectedGate';

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ScannerLanguageProvider fallback={<BootScreen />}>
        <ScannerApp />
      </ScannerLanguageProvider>
    </SafeAreaProvider>
  );
}

function ScannerApp() {
  const { t } = useScannerLanguage();
  const [session, setSession] = useState<Session | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [deviceId, setDeviceId] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const authPending = useRef(false);
  const [loginError, setLoginError] = useState<MessageKey | null>(null);

  const [concerts, setConcerts] = useState<StaffConcert[]>([]);
  const [selectedConcert, setSelectedConcert] = useState<StaffConcert | null>(null);
  const [datasetInfo, setDatasetInfo] = useState<Record<string, DatasetInfo>>({});
  const [isLoadingConcerts, setIsLoadingConcerts] = useState(false);
  const [concertError, setConcertError] = useState<MessageKey | null>(null);
  const [initialGate, setInitialGate] = useState('');
  const scanPending = useRef(false);
  const syncPending = useRef(false);
  const concertLoad = useRef(0);
  const selectionWrite = useRef(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    async function restore() {
      try {
        const [token, user, restoredDeviceId, cachedConcerts, selectedId, savedGate] =
          await Promise.all([
            getAccessToken(),
            getStaffUser(),
            getOrCreateDeviceId(),
            listCachedConcerts(),
            getMetadata(SELECTED_CONCERT_KEY),
            getMetadata(SELECTED_GATE_KEY),
          ]);
        if (!mounted) return;
        setDeviceId(restoredDeviceId);
        setConcerts(cachedConcerts);
        if (token && user?.role === 'STAFF') {
          setSession({ accessToken: token, user });
          const restoredConcert = cachedConcerts.find((concert) => concert.id === selectedId);
          if (restoredConcert) {
            setSelectedConcert(restoredConcert);
            setInitialGate(savedGate ?? '');
          }
        } else if (token || user) {
          await logoutStaff();
        }
      } catch {
        if (mounted) setLoginError('restoreError');
      } finally {
        if (mounted) setIsBooting(false);
      }
    }
    restore();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => NetInfo.addEventListener((state) => setIsOnline(state.isConnected !== false)), []);

  useEffect(() => {
    if (session) void loadConcerts();
    return () => { concertLoad.current += 1; };
  }, [session, isOnline]);

  async function handleLogin() {
    if (authPending.current) return;
    if (!email.trim() || !password) {
      setLoginError('credentials');
      return;
    }
    authPending.current = true;
    setIsSubmitting(true);
    setLoginError(null);
    try {
      const response = await loginStaff(email.trim(), password);
      setSession({ accessToken: response.accessToken, user: response.user });
      setPassword('');
    } catch (error) {
      setLoginError(toErrorKey(error, 'loginFailed'));
    } finally {
      authPending.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    concertLoad.current += 1;
    setSession(null);
    setSelectedConcert(null);
    setConcerts([]);
    setDatasetInfo({});
    setPassword('');
    setInitialGate('');
    authPending.current = true;
    setIsSubmitting(true);
    try {
      await logoutStaff();
    } catch {
      setLoginError('logoutError');
    } finally {
      authPending.current = false;
      setIsSubmitting(false);
    }
  }

  async function loadConcerts() {
    if (!session) return;
    const request = ++concertLoad.current;
    setIsLoadingConcerts(true);
    setConcertError(null);
    try {
      const cached = await listCachedConcerts();
      if (request !== concertLoad.current) return;
      if (cached.length) {
        setConcerts(cached);
        await loadDatasetInfo(cached, request);
      }
      if (isOnline) {
        const page = await getStaffConcerts(session.accessToken);
        if (request !== concertLoad.current) return;
        await cacheStaffConcerts(page.content);
        if (request !== concertLoad.current) return;
        setConcerts(page.content);
        await loadDatasetInfo(page.content, request);
      }
    } catch (error) {
      if (request === concertLoad.current) setConcertError(toErrorKey(error));
    } finally {
      if (request === concertLoad.current) setIsLoadingConcerts(false);
    }
  }

  async function loadDatasetInfo(items: StaffConcert[], request: number) {
    const entries = await Promise.all(
      items.map(async (concert) => [concert.id, await getDatasetInfo(concert.id)] as const),
    );
    if (request === concertLoad.current) setDatasetInfo(Object.fromEntries(entries));
  }

  function handleSelectConcert(concert: StaffConcert) {
    setInitialGate('');
    setSelectedConcert(concert);
    saveSelection(concert.id, '');
  }

  function saveSelection(concertId: string, gate: string) {
    // Serialize these writes because old installs store the selection as two keys.
    selectionWrite.current = selectionWrite.current
      .then(async () => {
        await setMetadata(SELECTED_GATE_KEY, '');
        await setMetadata(SELECTED_CONCERT_KEY, concertId);
        if (gate) await setMetadata(SELECTED_GATE_KEY, gate);
      })
      .catch(() => Alert.alert(t('gateSaveError'), t('gateSaveHint')));
  }

  if (isBooting) return <BootScreen />;

  if (!session) {
    return (
      <StaffLoginScreen
        email={email}
        password={password}
        errorMessage={loginError ? t(loginError) : null}
        isSubmitting={isSubmitting}
        onChangeEmail={setEmail}
        onChangePassword={setPassword}
        onSubmit={handleLogin}
      />
    );
  }

  if (!selectedConcert) {
    return (
      <ConcertListScreen
        user={session.user}
        concerts={concerts}
        datasetInfo={datasetInfo}
        isLoading={isLoadingConcerts}
        isOnline={isOnline}
        errorMessage={concertError ? t(concertError) : null}
        onRefresh={loadConcerts}
        onSelectConcert={handleSelectConcert}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <ConcertWorkspace
      key={selectedConcert.id}
      selectedConcert={selectedConcert}
      initialGate={initialGate}
      initialDataset={datasetInfo[selectedConcert.id]}
      session={session}
      deviceId={deviceId}
      isOnline={isOnline}
      scanPending={scanPending}
      syncPending={syncPending}
      onSaveGate={(gate) => saveSelection(selectedConcert.id, gate)}
      onChangeEvent={() => {
        setSelectedConcert(null);
        void loadConcerts();
      }}
      onLogout={handleLogout}
    />
  );
}

function ConcertWorkspace({
  selectedConcert, initialGate, initialDataset, session, deviceId, isOnline,
  scanPending, syncPending, onSaveGate, onChangeEvent, onLogout,
}: {
  selectedConcert: StaffConcert;
  initialGate: string;
  initialDataset?: DatasetInfo;
  session: Session;
  deviceId: string;
  isOnline: boolean;
  scanPending: { current: boolean };
  syncPending: { current: boolean };
  onSaveGate: (value: string) => void;
  onChangeEvent: () => void;
  onLogout: () => void;
}) {
  const { t } = useScannerLanguage();
  const [screen, setScreen] = useState<ConcertRoute>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [overview, setOverview] = useState<StaffConcertOverview | null>(null);
  const [gate, setGate] = useState(initialGate);
  const [savedGate, setSavedGate] = useState(initialGate);
  const [selectedDataset, setSelectedDataset] = useState(
    initialDataset ?? { downloadedAt: null, totalCount: 0 },
  );
  const [syncError, setSyncError] = useState<MessageKey | null>(null);
  const syncOnReconnect = useRef(false);
  const previousConnection = useRef(isOnline);

  const [qrCode, setQrCode] = useState('');
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [authority, setAuthority] = useState<'unknown' | 'reachable' | 'unreachable'>('unknown');
  const [checkinResult, setCheckinResult] = useState<ManualCheckinResult | null>(null);
  const [counters, setCounters] = useState<LogStatusCounts>(EMPTY_LOG_COUNTERS);

  const [isDownloading, setIsDownloading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<PendingSyncSummary | null>(null);
  const [operationError, setOperationError] = useState<MessageKey | null>(null);
  const [gateError, setGateError] = useState<MessageKey | null>(null);

  const [localTickets, setLocalTickets] = useState<LocalTicketListItem[]>([]);
  const [localTicketIndex, setLocalTicketIndex] = useState<Pick<LocalTicketListItem, 'qrCode' | 'ticketId'>[]>([]);
  const [serverTickets, setServerTickets] = useState<StaffTicket[]>([]);
  const [localLogs, setLocalLogs] = useState<LocalCheckinLog[]>([]);
  const [serverHistory, setServerHistory] = useState<ServerCheckinHistory[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [ticketsError, setTicketsError] = useState<MessageKey | null>(null);
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [dataError, setDataError] = useState<MessageKey | null>(null);
  const historyRequest = useRef(0);
  const ticketsRequest = useRef(0);
  const localActivityRequest = useRef(0);
  const history = useMemo(
    () => mergeHistory(localLogs, serverHistory, [...localTicketIndex, ...serverTickets]),
    [localLogs, serverHistory, localTicketIndex, serverTickets],
  );

  const [guestList, setGuestList] = useState<StaffGuestListEntry[]>([]);
  const [isDownloadingGuestList, setIsDownloadingGuestList] = useState(false);
  const [guestCheckinId, setGuestCheckinId] = useState<string | null>(null);

  useEffect(() => {
    if (screen === 'data') void loadTickets();
    if (screen === 'history' || screen === 'scanner') void loadHistory();
  }, [screen, isOnline]);

  useEffect(() => {
    setAuthority('unknown');
    void refreshSelectedConcert();
  }, [isOnline]);

  useEffect(() => {
    void Promise.all([
      refreshLocalActivity(),
      loadLocalTicketIndex(),
    ]).catch(() => setDataError('readHistoryError'));
    return () => { syncOnReconnect.current = false; };
  }, []);

  useEffect(() => {
    if (!previousConnection.current && isOnline) {
      syncOnReconnect.current = true;
      void handleSync();
    }
    previousConnection.current = isOnline;
  }, [isOnline]);

  async function refreshSelectedConcert() {
    if (!selectedConcert || !session) return;
    try {
      setSelectedDataset(await getDatasetInfo(selectedConcert.id));
      if (isOnline) {
        setOverview(await getStaffConcertOverview(selectedConcert.id, session.accessToken));
        setAuthority('reachable');
      }
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.unreachable) setAuthority('unreachable');
        else if (error.status) setAuthority('reachable');
      }
      setOperationError(toErrorKey(error));
    }
  }

  async function handleDownloadDataset() {
    if (!selectedConcert || !session) return;
    setIsDownloading(true);
    setOperationError(null);
    try {
      await downloadCheckinDataset({
        concertId: selectedConcert.id,
        gate,
        accessToken: session.accessToken,
      });
      await Promise.all([refreshSelectedConcert(), loadLocalTicketIndex()]);
    } catch (error) {
      setOperationError(toErrorKey(error));
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleDownloadGuestList() {
    if (!selectedConcert || !session) return;
    setIsDownloadingGuestList(true);
    setOperationError(null);
    try {
      const response = await getStaffGuestList(selectedConcert.id, session.accessToken);
      setGuestList(response);
    } catch (error) {
      setOperationError(toErrorKey(error));
    } finally {
      setIsDownloadingGuestList(false);
    }
  }

  async function handleCheckInGuest(guest: StaffGuestListEntry) {
    if (!gate.trim() || guest.checkedInAt || guest.concertId !== selectedConcert.id) return;
    setGuestCheckinId(guest.guestId);
    setOperationError(null);
    try {
      const updatedGuest = await checkInStaffGuest(
        guest.guestId,
        { concertId: selectedConcert.id, gate: gate.trim() },
        session.accessToken,
      );
      setGuestList((current) =>
        current.map((item) => (item.guestId === updatedGuest.guestId ? updatedGuest : item)),
      );
    } catch (error) {
      setOperationError(toErrorKey(error));
    } finally {
      setGuestCheckinId(null);
    }
  }

  async function runCheckin(value: string) {
    if (!gate.trim() || !value.trim() || scanPending.current) return;
    scanPending.current = true;
    setIsCheckingIn(true);
    try {
      const outcome = await performOnlineCheckin({
        concertId: selectedConcert.id,
        qrCode: value,
        gate,
        deviceId,
        accessToken: session.accessToken,
      });
      setAuthority(
        outcome.result.status === 'ONLINE_ACCEPTED' || outcome.result.status === 'ONLINE_FAILED'
          ? 'reachable' : 'unreachable',
      );
      setCheckinResult(outcome.result);
      if (outcome.inserted || outcome.result.status === 'ONLINE_ACCEPTED') {
        setQrCode('');
        void refreshLocalActivity().catch(() => setDataError('readHistoryError'));
        if (outcome.result.status === 'ONLINE_ACCEPTED' && !outcome.inserted) void loadHistory();
      }
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : null;
      if (status) setAuthority('reachable');
      setCheckinResult({
        status: status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'ERROR',
        message: status === 401 ? 'signInAgain'
          : status === 403 ? 'contactOrganizer'
            : 'tryCheckin',
        qrCode: value.trim(),
      });
    } finally {
      scanPending.current = false;
      setIsCheckingIn(false);
    }
  }

  async function refreshLocalActivity() {
    const request = ++localActivityRequest.current;
    const [logs, counts] = await Promise.all([
      listLocalCheckinLogs(selectedConcert.id),
      loadCheckinCounters(selectedConcert.id),
    ]);
    if (request !== localActivityRequest.current) return;
    setLocalLogs(logs);
    setCounters(counts);
  }

  async function loadLocalTicketIndex() {
    const tickets = await listLocalTickets(selectedConcert.id);
    setLocalTicketIndex(tickets.map(({ qrCode, ticketId }) => ({ qrCode, ticketId })));
  }

  async function handleSync() {
    if (syncPending.current) return;
    syncOnReconnect.current = false;
    syncPending.current = true;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const summary = await syncPendingLogs({
        concertId: selectedConcert.id,
        deviceId,
        accessToken: session.accessToken,
      });
      setSyncSummary(summary);
      if (summary.total) setAuthority('reachable');
      if (summary.total) await loadHistory();
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.unreachable) setAuthority('unreachable');
        else if (error.status) setAuthority('reachable');
      }
      setSyncError(toErrorKey(error, 'historySyncError'));
      // A batch can have updated some local rows before it failed.
      await refreshLocalActivity().catch(() => undefined);
    } finally {
      syncPending.current = false;
      setIsSyncing(false);
      if (syncOnReconnect.current) void handleSync();
    }
  }

  async function loadHistory() {
    const request = ++historyRequest.current;
    setIsLoadingData(true);
    setDataError(null);
    try {
      await refreshLocalActivity();
      if (isOnline) {
        const result = await getCheckinHistory(selectedConcert.id, { size: 100 }, session.accessToken);
        if (request !== historyRequest.current) return;
        setServerHistory(result.content);
        setServerTotal(result.totalElements);
      }
    } catch (error) {
      if (request === historyRequest.current) setDataError(toErrorKey(error, 'historyLoadError'));
    } finally {
      if (request === historyRequest.current) setIsLoadingData(false);
    }
  }

  async function loadTickets() {
    const request = ++ticketsRequest.current;
    setIsLoadingTickets(true);
    setTicketsError(null);
    try {
      const local = await listLocalTickets(selectedConcert.id);
      if (request !== ticketsRequest.current) return;
      setLocalTickets(local);
      if (isOnline) {
        const result = await getStaffTickets(selectedConcert.id, { size: 100 }, session.accessToken);
        if (request === ticketsRequest.current) setServerTickets(result.content);
      }
    } catch (error) {
      if (request === ticketsRequest.current) setTicketsError(toErrorKey(error, 'ticketLoadError'));
    } finally {
      if (request === ticketsRequest.current) setIsLoadingTickets(false);
    }
  }

  function navigateWithinConcert(next: ConcertRoute) {
    if ((next === 'scanner' || next === 'guestlist') && !gate.trim()) {
      setScreen('overview');
      setGateError('gateRequired');
      return;
    }
    if (gate.trim() && gate.trim() !== savedGate) {
      setSavedGate(gate.trim());
      onSaveGate(gate.trim());
    }
    setScreen(next);
  }

  let content;

  if (screen === 'scanner') {
    content = (
      <ScannerHomeScreen
        concert={selectedConcert}
        gate={gate}
        qrCode={qrCode}
        authority={authority}
        menuOpen={menuOpen}
        isCheckingIn={isCheckingIn}
        result={checkinResult}
        recent={history.slice(0, 3)}
        onOpenHistory={() => navigateWithinConcert('history')}
        onChangeQrCode={setQrCode}
        onCheckin={() => runCheckin(qrCode)}
        onCameraQrScanned={runCheckin}
      />
    );
  } else if (screen === 'history') {
    content = (
      <ScanHistoryScreen
        eventTitle={selectedConcert.title}
        entries={history}
        serverTotal={serverTotal}
        isLoading={isLoadingData}
        errorMessage={dataError ? t(dataError) : null}
        pending={counters.PENDING}
        syncing={isSyncing}
        syncError={syncError ? t(syncError) : null}
        syncSummary={syncSummary}
        onReload={loadHistory}
        onSync={handleSync}
      />
    );
  } else if (screen === 'data') {
    content = (
      <ConcertDataScreen
        concert={selectedConcert}
        localTickets={localTickets}
        serverTickets={serverTickets}
        isOnline={isOnline}
        isLoading={isLoadingTickets}
        errorMessage={ticketsError ? t(ticketsError) : null}
        onRefresh={loadTickets}
      />
    );
  } else if (screen === 'guestlist') {
    content = (
      <GuestListScreen
        concert={selectedConcert}
        guestList={guestList}
        gate={gate}
        isOnline={isOnline}
        checkingInGuestId={guestCheckinId}
        errorMessage={operationError ? t(operationError) : null}
        onBack={() => navigateWithinConcert('overview')}
        onCheckInGuest={handleCheckInGuest}
      />
    );
  } else {
    content = (
      <ConcertOverviewScreen
        concert={selectedConcert}
        overview={overview}
        datasetInfo={selectedDataset}
        counters={counters}
        gate={gate}
        gateError={gateError ? t(gateError) : null}
        isOnline={isOnline}
        isDownloading={isDownloading}
        isSyncing={isSyncing}
        errorMessage={operationError ? t(operationError) : syncError ? t(syncError) : null}
        syncSummary={syncSummary}
        onChangeGate={(value) => {
          setGate(value);
          setGateError(null);
        }}
        onDownloadDataset={handleDownloadDataset}
        onSync={handleSync}
        onDownloadGuestList={handleDownloadGuestList}
        onOpenScanner={() => navigateWithinConcert('scanner')}
        onOpenGuests={() => navigateWithinConcert('guestlist')}
        hasGuestList={guestList.length > 0}
        isDownloadingGuestList={isDownloadingGuestList}
      />
    );
  }

  return (
    <ConcertShell
      screen={screen}
      eventTitle={selectedConcert.title}
      gate={gate}
      staffName={session.user.fullName}
      menuOpen={menuOpen}
      hasGuests={guestList.length > 0}
      pending={counters.PENDING}
      syncing={isSyncing}
      syncError={syncError ? t(syncError) : null}
      onMenuChange={setMenuOpen}
      onNavigate={navigateWithinConcert}
      onChangeEvent={onChangeEvent}
      onSync={handleSync}
      onLogout={onLogout}
    >
      {content}
    </ConcertShell>
  );
}

function toErrorKey(error: unknown, fallback: MessageKey = 'genericError'): MessageKey {
  if (error instanceof ApiClientError) {
    if (error.status === 401 && fallback !== 'loginFailed') return 'expiredHint';
    if (error.status === 403) return fallback === 'loginFailed' ? 'staffOnly' : 'operationForbidden';
    if (error.unreachable) return 'authorityHint';
  }
  return fallback;
}
