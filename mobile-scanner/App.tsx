import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef, useState } from 'react';
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
  performManualOfflineCheckin,
  performOnlineCheckin,
} from './src/features/checkin';
import type { ManualCheckinResult } from './src/features/checkin';
import { downloadCheckinDataset, syncPendingLogs } from './src/features/sync';
import type { PendingSyncSummary } from './src/features/sync';
import {
  BootScreen,
  ConcertDataScreen,
  ConcertListScreen,
  ConcertOverviewScreen,
  GuestListScreen,
  ScannerHomeScreen,
  StaffLoginScreen,
} from './src/screens';

type Session = { accessToken: string; user: StaffUser };
import { ConcertShell, type ConcertRoute } from './src/ui/ConcertShell';

const SELECTED_CONCERT_KEY = 'scanner:selectedConcertId';
const SELECTED_GATE_KEY = 'scanner:selectedGate';

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ScannerApp />
    </SafeAreaProvider>
  );
}

function ScannerApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [deviceId, setDeviceId] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [concerts, setConcerts] = useState<StaffConcert[]>([]);
  const [selectedConcert, setSelectedConcert] = useState<StaffConcert | null>(null);
  const [datasetInfo, setDatasetInfo] = useState<Record<string, DatasetInfo>>({});
  const [isLoadingConcerts, setIsLoadingConcerts] = useState(false);
  const [concertError, setConcertError] = useState<string | null>(null);
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
    if (!email.trim() || !password) {
      setLoginError('Nhập email và mật khẩu STAFF.');
      return;
    }
    setIsSubmitting(true);
    setLoginError(null);
    try {
      const response = await loginStaff(email.trim(), password);
      setSession({ accessToken: response.accessToken, user: response.user });
      setPassword('');
    } catch (error) {
      setLoginError(toErrorMessage(error));
    } finally {
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
    await logoutStaff();
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
      if (request === concertLoad.current) setConcertError(toErrorMessage(error));
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
      .catch(() => Alert.alert('Không thể lưu cổng', 'Vui lòng xác nhận lại cổng khi mở ứng dụng.'));
  }

  if (isBooting) return <BootScreen />;

  if (!session) {
    return (
      <StaffLoginScreen
        email={email}
        password={password}
        errorMessage={loginError}
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
        errorMessage={concertError}
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
  const [screen, setScreen] = useState<ConcertRoute>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [overview, setOverview] = useState<StaffConcertOverview | null>(null);
  const [gate, setGate] = useState(initialGate);
  const [savedGate, setSavedGate] = useState(initialGate);
  const [selectedDataset, setSelectedDataset] = useState(
    initialDataset ?? { downloadedAt: null, totalCount: 0 },
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const previousConnection = useRef(isOnline);

  const [qrCode, setQrCode] = useState('');
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkinResult, setCheckinResult] = useState<ManualCheckinResult | null>(null);
  const [counters, setCounters] = useState<LogStatusCounts>(EMPTY_LOG_COUNTERS);

  const [isDownloading, setIsDownloading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<PendingSyncSummary | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  const [localTickets, setLocalTickets] = useState<LocalTicketListItem[]>([]);
  const [serverTickets, setServerTickets] = useState<StaffTicket[]>([]);
  const [localLogs, setLocalLogs] = useState<LocalCheckinLog[]>([]);
  const [serverHistory, setServerHistory] = useState<ServerCheckinHistory[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [guestList, setGuestList] = useState<StaffGuestListEntry[]>([]);
  const [isDownloadingGuestList, setIsDownloadingGuestList] = useState(false);
  const [guestCheckinId, setGuestCheckinId] = useState<string | null>(null);

  useEffect(() => {
    void refreshSelectedConcert();
    if (screen !== 'overview' && screen !== 'guestlist') void loadConcertData();
  }, [screen, isOnline]);

  useEffect(() => {
    if (!previousConnection.current && isOnline) void handleSync();
    previousConnection.current = isOnline;
  }, [isOnline]);

  async function refreshSelectedConcert() {
    if (!selectedConcert || !session) return;
    const [info, nextCounters] = await Promise.all([
      getDatasetInfo(selectedConcert.id),
      loadCheckinCounters(selectedConcert.id),
    ]);
    setSelectedDataset(info);
    setCounters(nextCounters);
    if (isOnline) {
      try {
        setOverview(await getStaffConcertOverview(selectedConcert.id, session.accessToken));
      } catch (error) {
        setOperationError(toErrorMessage(error));
      }
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
      await refreshSelectedConcert();
    } catch (error) {
      setOperationError(toErrorMessage(error));
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
      setOperationError(toErrorMessage(error));
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
      setOperationError(toErrorMessage(error));
    } finally {
      setGuestCheckinId(null);
    }
  }

  async function runCheckin(value: string) {
    if (!gate.trim() || !value.trim() || scanPending.current) return;
    scanPending.current = true;
    setIsCheckingIn(true);
    try {
      const outcome = isOnline
        ? await performOnlineCheckin({
            concertId: selectedConcert.id,
            qrCode: value,
            gate,
            deviceId,
            accessToken: session.accessToken,
          })
        : await performManualOfflineCheckin({
            concertId: selectedConcert.id,
            qrCode: value,
            gate,
          });
      setCheckinResult(outcome.result);
      if (outcome.inserted || outcome.result.status === 'ONLINE_ACCEPTED') {
        setQrCode('');
        setCounters(await loadCheckinCounters(selectedConcert.id));
      }
    } catch (error) {
      setCheckinResult({
        status: isOnline ? 'ONLINE_FAILED' : 'INVALID_LOCAL',
        message: toErrorMessage(error),
        qrCode: value.trim(),
      });
    } finally {
      scanPending.current = false;
      setIsCheckingIn(false);
    }
  }

  async function handleSync() {
    if (syncPending.current) return;
    syncPending.current = true;
    setIsSyncing(true);
    setSyncError(null);
    try {
      setSyncSummary(
        await syncPendingLogs({
          concertId: selectedConcert.id,
          deviceId,
          accessToken: session.accessToken,
        }),
      );
      setCounters(await loadCheckinCounters(selectedConcert.id));
    } catch (error) {
      setSyncError(toErrorMessage(error));
    } finally {
      syncPending.current = false;
      setIsSyncing(false);
    }
  }

  async function loadConcertData() {
    if (!selectedConcert || !session) return;
    setIsLoadingData(true);
    setDataError(null);
    try {
      const [tickets, logs] = await Promise.all([
        listLocalTickets(selectedConcert.id),
        listLocalCheckinLogs(selectedConcert.id),
      ]);
      setLocalTickets(tickets);
      setLocalLogs(logs);
      if (isOnline) {
        const [ticketPage, historyPage] = await Promise.all([
          getStaffTickets(selectedConcert.id, { size: 100 }, session.accessToken),
          getCheckinHistory(selectedConcert.id, { size: 100 }, session.accessToken),
        ]);
        setServerTickets(ticketPage.content);
        setServerHistory(historyPage.content);
      }
    } catch (error) {
      setDataError(toErrorMessage(error));
    } finally {
      setIsLoadingData(false);
    }
  }

  function navigateWithinConcert(next: ConcertRoute) {
    if ((next === 'scanner' || next === 'guestlist') && !gate.trim()) {
      setScreen('overview');
      Alert.alert('Chưa xác nhận cổng', 'Nhập cổng đang làm việc trong mục Tổng quan.');
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
        counters={counters}
        isOnline={isOnline}
        hasDataset={Boolean(selectedDataset.downloadedAt)}
        isCheckingIn={isCheckingIn}
        result={checkinResult}
        onChangeQrCode={setQrCode}
        onCheckin={() => runCheckin(qrCode)}
        onCameraQrScanned={runCheckin}
      />
    );
  } else if (screen === 'data' || screen === 'history') {
    content = (
      <ConcertDataScreen
        key={screen}
        initialTab={screen === 'history' ? 'history' : 'tickets'}
        concert={selectedConcert}
        localTickets={localTickets}
        serverTickets={serverTickets}
        localLogs={localLogs}
        serverHistory={serverHistory}
        isOnline={isOnline}
        isLoading={isLoadingData}
        errorMessage={dataError}
        onRefresh={loadConcertData}
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
        errorMessage={operationError}
        onBack={() => setScreen('overview')}
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
      isOnline={isOnline}
      isDownloading={isDownloading}
      isSyncing={isSyncing}
      errorMessage={operationError ?? syncError}
      syncSummary={syncSummary}
      onChangeGate={setGate}
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
      syncError={syncError}
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

function toErrorMessage(error: unknown) {
  if (error instanceof ApiClientError || error instanceof Error) return error.message;
  return 'Có lỗi xảy ra. Vui lòng thử lại.';
}
