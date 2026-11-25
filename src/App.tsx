import { useCallback, useEffect, useState } from 'react';
import {
  Command,
  Maximize2,
  Minimize2,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { WorkspaceTab } from '../shared/types.ts';
import { CRYPTO_TRIVIA, getThemeLabel } from './lib/experience.ts';
import { useVaultBeam } from './hooks/useVaultBeam.ts';
import { useExperience } from './hooks/useExperience.ts';
import { TopBar } from './components/TopBar.tsx';
import { IntroHero } from './components/IntroHero.tsx';
import { SessionBar } from './components/SessionBar.tsx';
import { DropZone } from './components/DropZone.tsx';
import { FileTables } from './components/FileTables.tsx';
import { TransferQueuePanel } from './components/TransferQueuePanel.tsx';
import { TelemetryRail } from './components/TelemetryRail.tsx';
import { HistoryView } from './components/HistoryView.tsx';
import { SecurityView } from './components/SecurityView.tsx';
import {
  ConfirmLeaveModal,
  CreateRoomModal,
  JoinRoomModal,
  RoomInviteModal,
} from './components/RoomModals.tsx';
import { ToastStack } from './components/ToastStack.tsx';
import { MobileDock } from './components/MobileDock.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { KeyArtModal } from './components/KeyArtModal.tsx';
import { EntropyModal } from './components/EntropyModal.tsx';
import { MatrixBackdrop } from './components/MatrixBackdrop.tsx';

export function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('workspace');
  const [commandOpen, setCommandOpen] = useState(false);
  const [keyArtOpen, setKeyArtOpen] = useState(false);
  const [entropyOpen, setEntropyOpen] = useState(false);
  const [triviaIndex, setTriviaIndex] = useState(0);

  const vb = useVaultBeam();

  const openCommandPalette = useCallback(() => {
    setCommandOpen(true);
  }, []);

  const exp = useExperience({
    inPrivateRoom: Boolean(vb.activeRoom),
    onNotify: vb.pushToast,
    onOpenCommandPalette: openCommandPalette,
  });

  // Unlock organic milestones
  useEffect(() => {
    if (vb.mySharedFiles.length > 0) {
      exp.unlockMilestone('first_share');
    }
  }, [vb.mySharedFiles.length, exp.unlockMilestone]);

  useEffect(() => {
    if (vb.activeRoom) {
      exp.unlockMilestone('private_vault');
      exp.setShowIntro(false);
    }
  }, [vb.activeRoom, exp.unlockMilestone, exp.setShowIntro]);

  useEffect(() => {
    if (vb.selfTestResult?.passed || vb.metrics.verifiedCount > 0) {
      exp.unlockMilestone('crypto_verified');
    }
  }, [vb.selfTestResult?.passed, vb.metrics.verifiedCount, exp.unlockMilestone]);

  const handleCopyText = useCallback(
    async (value: string, label: string) => {
      try {
        await navigator.clipboard.writeText(value);
        vb.pushToast(`${label} copied to clipboard`, 'success');
      } catch {
        vb.pushToast(`Could not copy ${label.toLowerCase()}`, 'warning');
      }
    },
    [vb]
  );

  const handlePrimaryHeaderAction = () => {
    if (vb.activeRoom) {
      void vb.openCurrentRoomInvite();
    } else {
      vb.setCreateModalOpen(true);
    }
  };

  const handleOpenKeyArt = useCallback(() => {
    setKeyArtOpen(true);
    exp.unlockMilestone('sigil_inspected');
  }, [exp.unlockMilestone]);

  const handleShowTrivia = useCallback(() => {
    const nextIdx = (triviaIndex + 1) % CRYPTO_TRIVIA.length;
    setTriviaIndex(nextIdx);
    const item = CRYPTO_TRIVIA[nextIdx];
    setActiveTab('security');
    vb.pushToast(`${item.year} · ${item.title}`, 'info');
  }, [triviaIndex, vb]);

  const queueBadgeCount = vb.queue.length + vb.activeUploads.length;
  const isAdvanced = exp.mode === 'advanced';
  const themeLabel = getThemeLabel(exp.theme);
  const ThemeIcon =
    exp.theme === 'dark' ? Moon : exp.theme === 'cipher' ? Sparkles : Sun;

  return (
    <div className="min-h-screen bg-[var(--vb-canvas)] text-[var(--vb-ink)] flex flex-col relative">
      {/* Optional /matrix subtle monochrome backdrop */}
      <MatrixBackdrop active={exp.matrixBackdrop} theme={exp.theme} />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Strict 3-Zone TopBar (or serene Zen header) */}
        {!exp.zenMode ? (
          <TopBar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            activeRoom={vb.activeRoom}
            queueBadgeCount={queueBadgeCount}
            onPrimaryAction={handlePrimaryHeaderAction}
            onLogoClick={exp.registerLogoTap}
          />
        ) : (
          <div className="sticky top-0 z-30 h-14 border-b border-[var(--vb-border)] bg-[var(--vb-surface)]/95 backdrop-blur-xs">
            <div className="max-w-3xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={exp.registerLogoTap}
                className="font-display text-base font-bold tracking-tight text-[var(--vb-ink)] cursor-pointer select-none"
              >
                VaultBeam <span className="font-normal text-[var(--vb-ink-muted)]">· Focus</span>
              </button>
              <button
                type="button"
                onClick={() => exp.setZenMode(false)}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--vb-border-strong)] hover:bg-[var(--vb-surface-2)] text-xs font-medium text-[var(--vb-ink)] transition-colors cursor-pointer"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                Exit Focus
                <span className="hidden sm:inline font-mono text-[11px] text-[var(--vb-ink-muted)] ml-1">
                  Esc
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Centered Serene Editorial Container */}
        <main
          className={`flex-1 w-full max-w-[1120px] mx-auto px-4 sm:px-6 pt-6 ${
            exp.zenMode ? 'pb-12 flex flex-col justify-center' : 'pb-24 md:pb-12'
          }`}
        >
          {exp.zenMode ? (
            <div className="w-full max-w-2xl mx-auto space-y-6">
              <DropZone
                defaultExpiryMs={vb.defaultExpiryMs}
                onChangeExpiryMs={vb.setDefaultExpiryMs}
                onFilesSelected={vb.shareFiles}
                scopeLabel={vb.activeRoom ? `Room ${vb.activeRoom.name}` : 'Open Lobby'}
                zenMode
              />
              {(vb.queue.length > 0 || vb.activeUploads.length > 0) && (
                <TransferQueuePanel
                  queue={vb.queue}
                  activeUploads={vb.activeUploads}
                  schedulingAlgorithm={vb.schedulingAlgorithm}
                  incognito={vb.incognito}
                  showSchedulerControls={isAdvanced}
                  onChangeAlgorithm={vb.setSchedulingAlgorithm}
                  onBoostItem={vb.boostQueueItem}
                  onCancelItem={vb.cancelQueueItem}
                  onReorderWaiting={vb.reorderWaitingQueue}
                />
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Quiet Controls Strip: Beginner/Advanced Switch + Light/Dark Theme */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    role="group"
                    aria-label="Interface complexity mode"
                    className="inline-flex items-center p-0.5 rounded-lg bg-[var(--vb-surface)] border border-[var(--vb-border)]"
                  >
                    <button
                      type="button"
                      onClick={() => exp.setMode('simple')}
                      aria-pressed={!isAdvanced}
                      className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer ${
                        !isAdvanced
                          ? 'bg-[var(--vb-accent)] text-[var(--vb-accent-ink)]'
                          : 'text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)]'
                      }`}
                    >
                      Simple
                    </button>
                    <button
                      type="button"
                      onClick={() => exp.setMode('advanced')}
                      aria-pressed={isAdvanced}
                      className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer ${
                        isAdvanced
                          ? 'bg-[var(--vb-accent)] text-[var(--vb-accent-ink)]'
                          : 'text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)]'
                      }`}
                    >
                      Advanced
                    </button>
                  </div>

                  {activeTab === 'workspace' && !exp.showIntro && !vb.activeRoom && (
                    <button
                      type="button"
                      onClick={() => exp.setShowIntro(true)}
                      className="min-h-[34px] text-xs text-[var(--vb-ink-muted)] hover:text-[var(--vb-ink)] transition-colors cursor-pointer"
                    >
                      Show intro
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={exp.cycleTheme}
                    aria-label={`Switch theme (current: ${themeLabel})`}
                    className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg vb-panel text-xs font-medium text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <ThemeIcon className="w-3.5 h-3.5 text-[var(--vb-ink)]" />
                    <span>{themeLabel}</span>
                  </button>

                  {isAdvanced && (
                    <>
                      <button
                        type="button"
                        onClick={exp.toggleZenMode}
                        title="Focus Drop Mode (/zen)"
                        className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg vb-panel text-xs font-medium text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Focus</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCommandOpen(true)}
                        title="Open Command Palette (Cmd+K)"
                        className="min-h-[36px] inline-flex items-center gap-2 px-3 py-1.5 rounded-lg vb-panel text-xs font-medium text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Command className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Commands</span>
                        <span className="font-mono text-[11px] text-[var(--vb-ink-muted)]">⌘K</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Send Tab (Primary Workspace) */}
              {activeTab === 'workspace' && (
                <div className="space-y-6">
                  {exp.showIntro && !vb.activeRoom && (
                    <IntroHero
                      inPrivateRoom={false}
                      onCreateRoom={() => vb.setCreateModalOpen(true)}
                      onJoinRoom={() => {
                        vb.setJoinPrefillRoomId('');
                        vb.setJoinPrefillRoomName(null);
                        vb.setJoinModalOpen(true);
                      }}
                      onDismiss={() => exp.setShowIntro(false)}
                    />
                  )}

                  <SessionBar
                    connected={vb.connected}
                    myPeerId={vb.myPeerId}
                    displayName={vb.displayName}
                    onUpdateDisplayName={vb.updateDisplayName}
                    identity={vb.identity}
                    activeRoom={vb.activeRoom}
                    vaultOre={exp.vaultOre}
                    theme={exp.theme}
                    onSelectVaultOre={exp.setVaultOre}
                    peers={vb.peers}
                    incognito={vb.incognito}
                    onToggleIncognito={vb.setIncognito}
                    nowMs={vb.nowMs}
                    advancedMode={isAdvanced}
                    onOpenJoinRoom={() => {
                      vb.setJoinPrefillRoomId('');
                      vb.setJoinPrefillRoomName(null);
                      vb.setJoinModalOpen(true);
                    }}
                    onOpenInviteModal={() => void vb.openCurrentRoomInvite()}
                    onRequestLeaveRoom={() => vb.setLeaveConfirmOpen(true)}
                    onOpenKeyArt={handleOpenKeyArt}
                    onCopyText={handleCopyText}
                  />

                  <DropZone
                    defaultExpiryMs={vb.defaultExpiryMs}
                    onChangeExpiryMs={vb.setDefaultExpiryMs}
                    onFilesSelected={vb.shareFiles}
                    scopeLabel={vb.activeRoom ? `Room ${vb.activeRoom.name}` : 'Open Lobby'}
                  />

                  {/* In Simple Mode: only show queue when something is actively transferring. In Advanced Mode: show full scheduler + live telemetry */}
                  {(isAdvanced || vb.queue.length > 0 || vb.activeUploads.length > 0) && (
                    <TransferQueuePanel
                      queue={vb.queue}
                      activeUploads={vb.activeUploads}
                      schedulingAlgorithm={vb.schedulingAlgorithm}
                      incognito={vb.incognito}
                      showSchedulerControls={isAdvanced}
                      onChangeAlgorithm={vb.setSchedulingAlgorithm}
                      onBoostItem={vb.boostQueueItem}
                      onCancelItem={vb.cancelQueueItem}
                      onReorderWaiting={vb.reorderWaitingQueue}
                    />
                  )}

                  {isAdvanced && (
                    <TelemetryRail
                      theme={exp.theme}
                      activeOre={vb.activeRoom ? exp.vaultOre : null}
                      uploadSpeedHistory={vb.uploadSpeedHistory}
                      downloadSpeedHistory={vb.downloadSpeedHistory}
                      currentUploadSpeed={vb.metrics.currentUploadSpeed}
                      currentDownloadSpeed={vb.metrics.currentDownloadSpeed}
                      peakSpeedBytes={vb.metrics.peakSpeedBytes}
                      activeSlotCount={vb.metrics.activeSlotCount}
                      maxConcurrent={vb.maxConcurrent}
                      waitingCount={vb.metrics.waitingCount}
                      utilizationPct={vb.metrics.utilizationPct}
                      avgWaitTimeSec={vb.metrics.avgWaitTimeSec}
                      avgTurnaroundSec={vb.metrics.avgTurnaroundSec}
                      throughputPerMin={vb.metrics.throughputPerMin}
                      onChangeMaxConcurrent={vb.setMaxConcurrent}
                    />
                  )}

                  <FileTables
                    mySharedFiles={vb.mySharedFiles}
                    remoteFiles={vb.remoteFiles}
                    incognito={vb.incognito}
                    nowMs={vb.nowMs}
                    inPrivateRoom={Boolean(vb.activeRoom)}
                    advancedMode={isAdvanced}
                    onUnshareFile={vb.unshareFile}
                    onUnshareAll={vb.unshareAllFiles}
                    onDownloadFile={vb.enqueueDownload}
                    onBatchDownload={vb.enqueueBatchDownloads}
                    onCopyAppUrl={() =>
                      void handleCopyText(
                        vb.activeRoom
                          ? `${window.location.origin}/room/${vb.activeRoom.id}`
                          : window.location.origin,
                        'Session link'
                      )
                    }
                  />
                </div>
              )}

              {/* Queue Tab */}
              {activeTab === 'queue' && (
                <div className="space-y-6">
                  <div>
                    <h1 className="text-xl font-semibold text-[var(--vb-ink)]">Transfer Queue</h1>
                    <p className="text-sm text-[var(--vb-ink-2)] mt-1">
                      Control download order, drag waiting items to prioritize, and adjust how many files transfer at once.
                    </p>
                  </div>

                  <TransferQueuePanel
                    queue={vb.queue}
                    activeUploads={vb.activeUploads}
                    schedulingAlgorithm={vb.schedulingAlgorithm}
                    incognito={vb.incognito}
                    showSchedulerControls
                    onChangeAlgorithm={vb.setSchedulingAlgorithm}
                    onBoostItem={vb.boostQueueItem}
                    onCancelItem={vb.cancelQueueItem}
                    onReorderWaiting={vb.reorderWaitingQueue}
                  />

                  <TelemetryRail
                    theme={exp.theme}
                    activeOre={vb.activeRoom ? exp.vaultOre : null}
                    uploadSpeedHistory={vb.uploadSpeedHistory}
                    downloadSpeedHistory={vb.downloadSpeedHistory}
                    currentUploadSpeed={vb.metrics.currentUploadSpeed}
                    currentDownloadSpeed={vb.metrics.currentDownloadSpeed}
                    peakSpeedBytes={vb.metrics.peakSpeedBytes}
                    activeSlotCount={vb.metrics.activeSlotCount}
                    maxConcurrent={vb.maxConcurrent}
                    waitingCount={vb.metrics.waitingCount}
                    utilizationPct={vb.metrics.utilizationPct}
                    avgWaitTimeSec={vb.metrics.avgWaitTimeSec}
                    avgTurnaroundSec={vb.metrics.avgTurnaroundSec}
                    throughputPerMin={vb.metrics.throughputPerMin}
                    onChangeMaxConcurrent={vb.setMaxConcurrent}
                  />
                </div>
              )}

              {/* History Tab */}
              {activeTab === 'history' && (
                <HistoryView history={vb.transferHistory} incognito={vb.incognito} />
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <SecurityView
                  identity={vb.identity}
                  activeRoom={vb.activeRoom}
                  selfTestResult={vb.selfTestResult}
                  selfTestRunning={vb.selfTestRunning}
                  milestones={exp.milestones}
                  triviaIndex={triviaIndex}
                  onChangeTriviaIndex={setTriviaIndex}
                  onRunSelfTest={() => void vb.executeCryptoSelfTest()}
                  onOpenKeyArt={handleOpenKeyArt}
                  onCopyText={handleCopyText}
                />
              )}
            </div>
          )}
        </main>

        {/* Quiet Editorial Footer */}
        {!exp.zenMode && (
          <footer className="hidden md:block border-t border-[var(--vb-border)] mt-auto">
            <div className="max-w-[1120px] mx-auto px-6 py-4 flex items-center justify-between text-xs text-[var(--vb-ink-muted)]">
              <span>VaultBeam · Direct encrypted file transfer</span>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setCommandOpen(true)}
                  className="hover:text-[var(--vb-ink)] transition-colors cursor-pointer"
                >
                  Shortcuts (⌘K)
                </button>
                <button
                  type="button"
                  onClick={handleOpenKeyArt}
                  className="hover:text-[var(--vb-ink)] transition-colors cursor-pointer font-mono tabular-nums"
                >
                  #{vb.identity?.fingerprint || 'INIT'}
                </button>
              </div>
            </div>
          </footer>
        )}

        {/* Mobile Bottom Dock (< md, hidden in Focus mode) */}
        {!exp.zenMode && (
          <MobileDock
            activeTab={activeTab}
            queueBadgeCount={queueBadgeCount}
            onSelectTab={setActiveTab}
          />
        )}
      </div>

      {/* Command Palette & Utility Modals */}
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        theme={exp.theme}
        vaultOre={exp.vaultOre}
        inPrivateRoom={Boolean(vb.activeRoom)}
        mode={exp.mode}
        cipherUnlocked={exp.cipherUnlocked}
        incognito={vb.incognito}
        zenMode={exp.zenMode}
        matrixBackdrop={exp.matrixBackdrop}
        soundEnabled={exp.soundEnabled}
        onSelectTab={setActiveTab}
        onSetMode={exp.setMode}
        onOpenCreateRoom={() => vb.setCreateModalOpen(true)}
        onOpenJoinRoom={() => {
          vb.setJoinPrefillRoomId('');
          vb.setJoinPrefillRoomName(null);
          vb.setJoinModalOpen(true);
        }}
        onSetTheme={exp.setTheme}
        onSetVaultOre={exp.setVaultOre}
        onActivateCipher={() => exp.activateCipherSecret('command')}
        onToggleIncognito={() => vb.setIncognito((v) => !v)}
        onToggleZen={exp.toggleZenMode}
        onToggleMatrix={exp.toggleMatrixBackdrop}
        onToggleSound={() => exp.setSoundEnabled((v) => !v)}
        onSetAlgorithm={vb.setSchedulingAlgorithm}
        onRunSelfTest={() => void vb.executeCryptoSelfTest()}
        onOpenKeyArt={handleOpenKeyArt}
        onOpenEntropy={() => setEntropyOpen(true)}
        onShowTrivia={handleShowTrivia}
        onSecretCommandUsed={() => exp.unlockMilestone('command_master')}
      />

      <KeyArtModal
        open={keyArtOpen}
        identity={vb.identity}
        displayName={vb.displayName}
        soundEnabled={exp.soundEnabled}
        onClose={() => setKeyArtOpen(false)}
        onCopyText={handleCopyText}
      />

      <EntropyModal
        open={entropyOpen}
        onClose={() => setEntropyOpen(false)}
        onCopyText={handleCopyText}
      />

      {/* Room Workflow Modals */}
      <CreateRoomModal
        open={vb.createModalOpen}
        onClose={() => vb.setCreateModalOpen(false)}
        onCreate={vb.createPrivateRoom}
        onCopyText={handleCopyText}
      />

      <RoomInviteModal
        invite={vb.inviteModalData}
        alreadyInRoom={Boolean(vb.activeRoom && vb.inviteModalData?.room.id === vb.activeRoom.id)}
        onClose={() => vb.setInviteModalData(null)}
        onEnterRoom={(roomId, password) => void vb.joinRoom(roomId, password)}
        onCopyText={handleCopyText}
      />

      <JoinRoomModal
        open={vb.joinModalOpen}
        prefillRoomId={vb.joinPrefillRoomId}
        prefillRoomName={vb.joinPrefillRoomName}
        busy={vb.joinBusy}
        error={vb.joinError}
        onClose={() => vb.setJoinModalOpen(false)}
        onJoin={vb.joinRoom}
        onClearError={() => vb.setJoinError(null)}
      />

      <ConfirmLeaveModal
        open={vb.leaveConfirmOpen}
        roomName={vb.activeRoom?.name || 'Private Room'}
        onCancel={() => vb.setLeaveConfirmOpen(false)}
        onConfirm={vb.leaveRoom}
      />

      <ToastStack toasts={vb.toasts} onDismiss={vb.dismissToast} />
    </div>
  );
}

export default App;
