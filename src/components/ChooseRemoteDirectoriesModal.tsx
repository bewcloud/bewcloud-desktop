import { useState } from 'preact/hooks';

import type { Directory } from '../types.ts';

interface ChooseRemoteDirectoriesModalProps {
  isOpen: boolean;
  directories: Directory[];
  onClickSave: (chosenPaths: string[]) => Promise<void> | void;
  onClose: () => void;
}

export default function ChooseRemoteDirectoriesModal({
  isOpen,
  directories,
  onClickSave,
  onClose,
}: ChooseRemoteDirectoriesModalProps) {
  const [chosenDirectories, setChosenDirectories] = useState<string[]>([]);

  function toggleChosenDirectory(directory: string) {
    const directoriesSet = new Set(chosenDirectories);

    if (directoriesSet.has(directory)) {
      directoriesSet.delete(directory);
    } else {
      directoriesSet.add(directory);
    }

    setChosenDirectories([...directoriesSet]);
  }

  return (
    <>
      <section
        class={`fixed ${
          isOpen ? 'block' : 'hidden'
        } z-40 w-screen h-screen inset-0 bg-gray-900 bg-opacity-60`}
      />

      <section
        class={`fixed ${
          isOpen ? 'block' : 'hidden'
        } z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 bg-slate-600 text-white rounded-md px-8 py-6 drop-shadow-lg overflow-y-scroll max-h-[80%]`}
      >
        <h1 class="text-2xl font-semibold my-5">
          Choose remote directories to sync
        </h1>
        <section class="py-5 my-2 border-y border-slate-500">
          <ol class="mt-2">
            {directories.map((directory) => (
              <li class="mb-1">
                <span
                  class="block px-2 py-2 hover:no-underline hover:opacity-60 bg-slate-700 cursor-pointer rounded-md"
                  onClick={() =>
                    toggleChosenDirectory(`${directory.directory_name}`)
                  }
                  onKeyDown={(event) => {
                    if (event.key === ' ') {
                      toggleChosenDirectory(`${directory.directory_name}`);
                    }
                  }}
                >
                  <p class="flex-auto flex truncate font-medium text-white justify-between">
                    {directory.directory_name}
                    {chosenDirectories.includes(directory.directory_name) ? (
                      <img
                        src="/chosen.svg"
                        class="white ml-2"
                        width={18}
                        alt="Chosen directory"
                      />
                    ) : null}
                  </p>
                </span>
              </li>
            ))}
          </ol>
        </section>
        <footer class="flex justify-between">
          <button
            type="button"
            class="px-5 py-2 bg-slate-600 hover:bg-slate-500 text-white cursor-pointer rounded-md"
            onClick={() => onClickSave(chosenDirectories)}
          >
            Choose
          </button>
          <button
            type="button"
            class="px-5 py-2 bg-slate-600 hover:bg-slate-500 text-white cursor-pointer rounded-md"
            onClick={() => onClose()}
          >
            Close
          </button>
        </footer>
      </section>
    </>
  );
}
