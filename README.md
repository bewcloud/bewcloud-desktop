# bewCloud Desktop Sync

[![](https://github.com/bewcloud/bewcloud-desktop/workflows/Run%20Tests/badge.svg)](https://github.com/bewcloud/bewcloud-desktop/actions?workflow=Run+Tests)

This is the Desktop Sync client for [bewCloud](https://github.com/bewcloud/bewcloud). It is built with [`Tauri`](https://tauri.app) and relies on [`rclone`](https://rclone.org), which relies on [`rsync`](https://rsync.samba.org).

Usernames, passwords, and sync is all handled by `rclone`. The connection to a bewCloud instance happens via HTTP and a remote via WebDav is created in `rclone`.

The app runs `rclone bisync` every five minutes, or when it's forced to do so.

If you're looking for the mobile app, it's at [`bewcloud-mobile`](https://github.com/bewcloud/bewcloud-mobile).

## Install

You need to have [`rclone`](https://rclone.org) installed in your computer, as the app makes a shell call to that command. If you already have configured remotes they won't show up (unless you manually edit the `<AppDataDir>/config.json`), but bewCloud will not affect them (new ones will be created and also shown by the app).

> [!NOTE]
> If you use a password to encrypt the `rclone` config file, [you need to have set `RCLONE_CONFIG_PASS` for your user, "globally"](https://rclone.org/docs/#other-environment-variables).

Then, download the appropriate binary [from the releases page](https://github.com/bewcloud/bewcloud-desktop/releases) for your OS and run it!

Alternatively, you can [build from source](#build-from-source)!

## Development

You need to have [Tauri's dependencies](https://tauri.app/v1/guides/getting-started/prerequisites#installing) installed.

Also, run `rustup component add rustfmt` so `make format` can also format the `rust` code.

```sh
$ make install # installs module dependendies
$ make start # runs the app
$ make format # formats the code
$ make test # runs tests
```

## Build from source

Don't forget to check the [development](#development) section above first!

> [!NOTE]
> If you're releasing a new version, update it in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `package.json` first.

```sh
$ make build # builds the app binaries!
```

## TODOs:

- [ ] Build binaries for Arch and RPM too (https://github.com/0-don/clippy/blob/master/.github/workflows/release.yml)
- [ ] Create release with signed builds on tag push
- [ ] Actually check and delete local directory's remote directories when they're removed
- [ ] Actually delete local directory when a remote is removed (code is commented)
- [ ] Implement directory watching (kind of complicated right now as `notify` or `hotwatch` get their watchers destroyed after Tauri's setup)
