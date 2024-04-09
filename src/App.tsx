import { useState, useEffect } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/tauri';
import { appDataDir, homeDir, join } from '@tauri-apps/api/path';
import { readTextFile } from '@tauri-apps/api/fs';
import { open } from '@tauri-apps/api/dialog';

import type { Config, Directory, NewRCloneRemote } from './types.ts';
import { fetchRemoteDirectories } from './utils.ts';
import ChooseRemoteDirectoriesModal from './components/ChooseRemoteDirectoriesModal.tsx';
import EditRemoteModal from './components/EditRemoteModal.tsx';

const CONFIG_FILE_NAME = 'config.json';

function App() {
  const [currentConfig, setCurrentConfig] = useState<Config | null>(null);
  const [newAccountUrl, setNewAccountUrl] = useState<string>('');
  const [newAccountUsername, setNewAccountUsername] = useState<string>('');
  const [newAccountPassword, setNewAccountPassword] = useState<string>('');
  const [newAccountName, setNewAccountName] = useState<string>('');
  const [isRemoteDirectoriesModalOpen, setIsRemoteDirectoriesModalOpen] =
    useState<boolean>(false);
  const [remoteDirectoryOptions, setRemoteDirectoryOptions] = useState<
    Directory[]
  >([]);
  const [isEditRemoteModalOpen, setIsEditRemoteModalOpen] =
    useState<boolean>(false);
  const [editRemoteName, setEditRemoteName] = useState<string>('');
  const [wantsToAddNewAccount, setWantsToAddNewAccount] =
    useState<boolean>(false);

  async function runSync() {
    const config = await getConfig();

    if (!config || config.accounts.length === 0) {
      console.info('No configured accounts found.');
      return;
    }

    await invoke('run_sync');
  }

  async function getConfig(): Promise<Config | null> {
    const appDataDirPath = await appDataDir();
    const configFilePath = await join(appDataDirPath, CONFIG_FILE_NAME);

    console.info(`Config file path: ${configFilePath}`);

    try {
      const configContents = await readTextFile(configFilePath);
      const config = JSON.parse(configContents) as Config;
      setCurrentConfig(config);
      return config;
    } catch (error) {
      console.error(error);
    }

    return null;
  }

  async function onNewAccountSubmit() {
    const newRemote: NewRCloneRemote = {
      url: newAccountUrl,
      username: newAccountUsername,
      password: newAccountPassword,
      name: newAccountName,
      local_directory: '',
      remote_directories: [],
    };

    if (!newRemote.url || !newRemote.url.includes('://')) {
      alert('A URL is required.');
      return;
    }

    if (!newRemote.name) {
      alert('An account name is required.');
      return;
    }

    // Connect and choose remote directories
    const directories = await fetchRemoteDirectories(
      newRemote.url,
      newRemote.username,
      newRemote.password,
    );

    if (directories.length > 0) {
      setRemoteDirectoryOptions(directories);
      setIsRemoteDirectoriesModalOpen(true);
    }
  }

  async function chooseLocalDirectoryAndCreateNewAccount(
    chosenRemoteDirectories: string[],
  ) {
    const newRemote: NewRCloneRemote = {
      url: newAccountUrl,
      username: newAccountUsername,
      password: newAccountPassword,
      name: newAccountName,
      local_directory: '',
      remote_directories: chosenRemoteDirectories,
    };

    if (newRemote.remote_directories.length === 0) {
      alert('At least one remote directory is required.');
      return;
    }

    setIsRemoteDirectoriesModalOpen(false);

    const homeDirPath = await homeDir();

    const selected = (await open({
      title: 'Choose the local directory to sync into',
      directory: true,
      defaultPath: homeDirPath,
    })) as string | null;

    if (!selected) {
      alert('A local directory is required.');
      return;
    }

    newRemote.local_directory = selected;

    const isLocalDirectoryEmpty: boolean = await invoke(
      'check_if_local_directory_is_empty',
      { directory: newRemote.local_directory },
    );

    if (!isLocalDirectoryEmpty) {
      if (
        !confirm(
          `"${newRemote.local_directory}" is not empty! That might cause unpredictable issues with synchronization. Continue?`,
        )
      ) {
        return;
      }
    }

    const addedRCloneRemote: boolean = await invoke('add_new_rclone_remote', {
      newRemote,
    });

    if (!addedRCloneRemote) {
      alert(
        'Failed to add new rclone remote. Please make sure rclone is installed and globally available.',
      );
      return;
    }

    setNewAccountUrl('');
    setNewAccountUsername('');
    setNewAccountPassword('');
    setNewAccountName('');
    setRemoteDirectoryOptions([]);
    setWantsToAddNewAccount(false);

    await runSync();
  }

  function onClickEditAccount(rCloneRemoteName: string) {
    setEditRemoteName(rCloneRemoteName);
    setIsEditRemoteModalOpen(true);
  }

  function onCloseEditAccount() {
    setIsEditRemoteModalOpen(false);
    setEditRemoteName('');

    runSync();
  }

  useEffect(() => {
    runSync();
  }, []);

  useEffect(() => {
    if (currentConfig === null || currentConfig.accounts.length === 0) {
      setWantsToAddNewAccount(true);
    } else {
      setWantsToAddNewAccount(false);
    }
  }, [currentConfig, setWantsToAddNewAccount]);

  const timeFormat = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <main>
      <section class="max-w-screen-md mx-auto flex flex-col items-center justify-center">
        <header class="px-4 pt-8 pb-2 max-w-screen-md mx-auto flex flex-col items-center justify-center">
          <a
            href="https://bewcloud.com"
            target="_blank"
            rel="noreferrer nopener"
          >
            <img
              class="mt-6 mb-2 drop-shadow-md"
              src="/logo-white.svg"
              width="250"
              height="50"
              alt="the bewCloud logo: a stylized logo"
            />
          </a>
        </header>

        <h1 class="text-2xl font-semibold my-5">
          Welcome to bewCloud Desktop Sync!
        </h1>

        <section class="py-5 my-2 border-y border-slate-600">
          {currentConfig && currentConfig.accounts.length > 0 ? (
            <>
              <ol class="mt-2">
                {currentConfig.accounts.map((account) => {
                  return (
                    <li class="mb-1">
                      <button
                        type="button"
                        class="text-[#51A4FB] no-underline hover:underline font-semibold"
                        title="Edit Sync"
                        onClick={() =>
                          onClickEditAccount(account.rclone.remote_name)
                        }
                      >
                        {account.rclone.remote_name}
                      </button>{' '}
                      // Last sync:{' '}
                      <time dateTime={account.last_sync_time}>
                        {timeFormat.format(new Date(account.last_sync_time))}
                      </time>
                    </li>
                  );
                })}
              </ol>

              <footer class="mt-8 mb-2 flex align-middle items-center justify-center">
                <button
                  type="button"
                  class="button-secondary"
                  onClick={() => runSync()}
                >
                  Run sync now
                </button>
              </footer>
            </>
          ) : (
            <p>No configured accounts found. Create one below!</p>
          )}
        </section>

        {!wantsToAddNewAccount ? (
          <button
            class="px-5 py-2 bg-slate-500 hover:bg-slate-400 text-white cursor-pointer rounded-md my-2"
            type="button"
            onClick={() => setWantsToAddNewAccount(true)}
          >
            Add new account
          </button>
        ) : null}

        {wantsToAddNewAccount ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onNewAccountSubmit();
            }}
          >
            <h3 class="text-xl font-semibold mb-4">
              Add a new bewCloud account:
            </h3>
            <fieldset class="block mb-2">
              <label class="text-slate-300 block pb-1" for="new_url">
                WebDav URL
              </label>
              <input
                class="input-field"
                name="new_url"
                id="new_url"
                type="url"
                placeholder="https://bewcloud.example.com/dav"
                onInput={(event) => setNewAccountUrl(event.currentTarget.value)}
                value={newAccountUrl}
              />
            </fieldset>

            <fieldset class="block mb-2">
              <label class="text-slate-300 block pb-1" for="new_username">
                Email
              </label>
              <input
                class="input-field"
                name="new_username"
                id="new_username"
                type="text"
                placeholder="jane.doe@example.com"
                autocorrect="off"
                autocapitalize="off"
                spellcheck={false}
                onInput={(event) =>
                  setNewAccountUsername(event.currentTarget.value)
                }
                value={newAccountUsername}
              />
            </fieldset>
            <fieldset class="block mb-2">
              <label class="text-slate-300 block pb-1" for="new_password">
                WebDav Password
              </label>
              <input
                class="input-field"
                name="new_password"
                id="new_password"
                type="password"
                placeholder="super-SECRET-passphrase"
                onInput={(event) =>
                  setNewAccountPassword(event.currentTarget.value)
                }
                value={newAccountPassword}
              />
            </fieldset>
            <fieldset class="block mb-2">
              <label class="text-slate-300 block pb-1" for="new_name">
                Account Name (for <code class="text-sm">rclone</code>)
              </label>
              <input
                class="input-field"
                name="new_name"
                id="new_name"
                type="text"
                placeholder="bewcloud"
                autocorrect="off"
                autocapitalize="off"
                spellcheck={false}
                onInput={(event) =>
                  setNewAccountName(event.currentTarget.value)
                }
                value={newAccountName}
              />
            </fieldset>

            <footer class="flex justify-center mt-8 mb-4">
              <button class="button" type="submit">
                Connect and choose directories to sync
              </button>
            </footer>
          </form>
        ) : null}

        <ChooseRemoteDirectoriesModal
          isOpen={isRemoteDirectoriesModalOpen}
          directories={remoteDirectoryOptions}
          onClickSave={chooseLocalDirectoryAndCreateNewAccount}
          onClose={() => setIsRemoteDirectoriesModalOpen(false)}
        />

        <EditRemoteModal
          isOpen={isEditRemoteModalOpen}
          remoteName={editRemoteName}
          config={currentConfig}
          onClose={onCloseEditAccount}
        />
      </section>
    </main>
  );
}

export default App;
