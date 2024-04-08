import { useEffect, useState } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/tauri';
import { homeDir } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/api/dialog';

import type { Config, Directory, NewRCloneRemote } from '../types.ts';
import { fetchRemoteDirectories } from '../utils.ts';
import ChooseRemoteDirectoriesModal from './ChooseRemoteDirectoriesModal.tsx';

interface EditRemoteModalProps {
  isOpen: boolean;
  remoteName: string;
  config: Config | null;
  onClose: () => void;
}

export default function EditRemoteModal({
  isOpen,
  remoteName,
  config,
  onClose,
}: EditRemoteModalProps) {
  const account = config?.accounts.find(
    (account) => account.rclone.remote_name === remoteName,
  );

  const [newAccountUrl, setNewAccountUrl] = useState<string>('');
  const [newAccountUsername, setNewAccountUsername] = useState<string>('');
  const [newAccountPassword, setNewAccountPassword] = useState<string>('');
  const [newAccountLocalDirectory, setNewAccountLocalDirectory] =
    useState<string>(account?.rclone.local_directory || '');

  const [wantsToChangeRemoteDirectories, setWantsToChangeRemoteDirectories] =
    useState<boolean>(false);
  const [isRemoteDirectoriesModalOpen, setIsRemoteDirectoriesModalOpen] =
    useState<boolean>(false);
  const [remoteDirectoryOptions, setRemoteDirectoryOptions] = useState<
    Directory[]
  >([]);
  const [chosenRemoteDirectories, setChosenRemoteDirectories] = useState<
    string[]
  >(account?.remote_directories || []);

  async function onClickOpenRemoteDirectories() {
    // Connect and choose remote directories
    const directories = await fetchRemoteDirectories(
      newAccountUrl,
      newAccountUsername,
      newAccountPassword,
    );

    if (directories.length > 0) {
      setRemoteDirectoryOptions(directories);
      setIsRemoteDirectoriesModalOpen(true);
    }
  }

  function onClickSaveRemoteDirectories(newRemoteDirectories: string[]) {
    if (newRemoteDirectories.length === 0) {
      alert('At least one remote directory is required.');
      return;
    }

    setChosenRemoteDirectories(newRemoteDirectories);
    setWantsToChangeRemoteDirectories(false);
    setIsRemoteDirectoriesModalOpen(false);
  }

  async function onClickChangeLocalDirectory() {
    const homeDirPath = await homeDir();

    const selected = (await open({
      title: 'Choose the local directory to sync into',
      directory: true,
      defaultPath: newAccountLocalDirectory || homeDirPath,
    })) as string | null;

    if (!selected) {
      alert('A local directory is required.');
      return;
    }

    setNewAccountLocalDirectory(selected);
  }

  async function onClickSave() {
    const updatedRemote: Omit<
      NewRCloneRemote,
      'url' | 'username' | 'password'
    > = {
      name: remoteName,
      local_directory: newAccountLocalDirectory,
      remote_directories: chosenRemoteDirectories,
    };

    const updatedRCloneRemote = await invoke('update_rclone_remote', {
      updatedRemote,
    });

    if (!updatedRCloneRemote) {
      alert(
        'Failed to update rclone remote. Please make sure rclone is installed and globally available.',
      );
      return;
    }

    onCloseEditRemoteModal();
  }

  async function onClickDelete() {
    const confirmed = confirm(
      'Are you sure you want to delete this remote and the local directory?',
    );
    if (!confirmed) {
      return;
    }

    const remoteToDelete: Omit<
      NewRCloneRemote,
      'url' | 'username' | 'password'
    > = {
      name: remoteName,
      local_directory: newAccountLocalDirectory,
      remote_directories: chosenRemoteDirectories,
    };

    const deletedRCloneRemote = await invoke('delete_rclone_remote', {
      remoteToDelete,
    });

    if (!deletedRCloneRemote) {
      alert(
        'Failed to delete rclone remote. Please make sure rclone is installed and globally available.',
      );
      return;
    }

    onCloseEditRemoteModal();
  }

  function onCloseEditRemoteModal() {
    setNewAccountUrl('');
    setNewAccountUsername('');
    setNewAccountPassword('');
    setNewAccountLocalDirectory('');
    setRemoteDirectoryOptions([]);
    setWantsToChangeRemoteDirectories(false);
    setIsRemoteDirectoriesModalOpen(false);
    onClose();
  }

  useEffect(() => {
    if (account) {
      setNewAccountLocalDirectory(account.rclone.local_directory);
      setChosenRemoteDirectories(account.remote_directories);
    }
  }, [account]);

  if (!account) {
    return null;
  }

  return (
    <>
      <section
        class={`fixed ${
          isOpen ? 'block' : 'hidden'
        } z-20 w-screen h-screen inset-0 bg-gray-900 bg-opacity-60`}
      />

      <section
        class={`fixed ${
          isOpen ? 'block' : 'hidden'
        } z-30 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 bg-slate-600 text-white rounded-md px-8 py-6 drop-shadow-lg overflow-y-scroll max-h-[80%]`}
      >
        <h1 class="text-2xl font-semibold my-5">Update "{remoteName}"</h1>
        <p class="py-2 px-3 bg-slate-500 rounded-md">
          NOTE: You can only delete the remote or change the local or remote
          directories.
        </p>
        <p class="my-2">
          <span class="font-semibold mr-2">Local directory:</span>{' '}
          <code class="text-sm">{newAccountLocalDirectory}</code>
        </p>
        <p class="my-2">
          <span class="font-semibold mr-2">Remote directories:</span>{' '}
          <code class="text-sm">{chosenRemoteDirectories.join(', ')}</code>
        </p>
        <button
          class="px-5 py-2 bg-slate-500 hover:bg-slate-400 text-white cursor-pointer rounded-md my-2"
          type="button"
          onClick={() => onClickChangeLocalDirectory()}
        >
          Change local directory
        </button>
        {!wantsToChangeRemoteDirectories ? (
          <button
            class="px-5 py-2 bg-slate-500 hover:bg-slate-400 text-white cursor-pointer rounded-md my-2"
            type="button"
            onClick={() => setWantsToChangeRemoteDirectories(true)}
          >
            Change remote directories
          </button>
        ) : null}
        {wantsToChangeRemoteDirectories ? (
          <>
            <h3 class="text-lg font-semibold my-6 pt-6 border-t border-t-slate-500">
              Add your bewCloud account details to list and change the remote
              directories:
            </h3>
            <p class="py-2 px-3 bg-slate-500 rounded-md mt-2 mb-6">
              NOTE: This information is necessary because the desktop sync
              client doesn't keep it. It's all stored in{' '}
              <code class="text-sm">rclone</code>.
            </p>
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
            <button
              type="button"
              class="button mt-2"
              onClick={() => onClickOpenRemoteDirectories()}
            >
              Connect and choose remote directories
            </button>
          </>
        ) : null}
        <footer class="flex justify-between mt-4">
          <button
            type="button"
            class="px-5 py-2 bg-[#51A4FB] hover:bg-sky-400 text-white cursor-pointer rounded-md"
            onClick={() => onClickSave()}
          >
            Save
          </button>
          <button
            type="button"
            class="px-5 py-2 bg-red-800 hover:bg-red-700 text-white cursor-pointer rounded-md"
            onClick={() => onClickDelete()}
          >
            Delete
          </button>
          <button
            type="button"
            class="px-5 py-2 bg-slate-600 hover:bg-slate-500 text-white cursor-pointer rounded-md"
            onClick={() => onCloseEditRemoteModal()}
          >
            Close
          </button>
        </footer>
      </section>

      <ChooseRemoteDirectoriesModal
        isOpen={isRemoteDirectoriesModalOpen}
        directories={remoteDirectoryOptions}
        onClickSave={onClickSaveRemoteDirectories}
        onClose={() => setIsRemoteDirectoriesModalOpen(false)}
      />
    </>
  );
}
