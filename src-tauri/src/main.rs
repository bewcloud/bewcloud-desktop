// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    path::{self, Path},
    process::Command,
    thread,
    time::{self, SystemTime},
};
use tauri::{
    AppHandle, CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu,
    SystemTrayMenuItem,
};

#[derive(Serialize, Deserialize, Clone)]
struct ConfigAccountRClone {
    remote_name: String,
    local_directory: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct ConfigAccount {
    remote_directories: Vec<String>,
    rclone: ConfigAccountRClone,
    last_sync_time: String,
}

#[derive(Serialize, Deserialize)]
struct Config {
    accounts: Vec<ConfigAccount>,
}

#[derive(Serialize, Deserialize)]
struct NewRCloneRemote {
    url: String,
    username: String,
    password: String,
    name: String,
    local_directory: String,
    remote_directories: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct UpdatedRCloneRemote {
    name: String,
    local_directory: String,
    remote_directories: Vec<String>,
}

#[tauri::command]
fn run_sync(app: AppHandle) {
    app.tray_handle()
        .set_icon(tauri::Icon::Raw(
            include_bytes!("../icons/sync-running.png").to_vec(),
        ))
        .unwrap();

    let config = get_json_config(&app);

    if config.accounts.len() == 0 {
        app.tray_handle()
            .set_icon(tauri::Icon::Raw(
                include_bytes!("../icons/sync-unset.png").to_vec(),
            ))
            .unwrap();
        return;
    }

    let one_minute = time::Duration::from_secs(60);

    tauri::async_runtime::spawn(async move {
        loop {
            app.tray_handle()
                .set_icon(tauri::Icon::Raw(
                    include_bytes!("../icons/sync-running.png").to_vec(),
                ))
                .unwrap();

            for account in &config.accounts {
                run_sync_for_account(&account);
                update_sync_time_in_json_config(&app, &account);
            }

            app.tray_handle()
                .set_icon(tauri::Icon::Raw(
                    include_bytes!("../icons/sync-done.png").to_vec(),
                ))
                .unwrap();

            thread::sleep(one_minute);
        }
    });
}

#[tauri::command]
fn add_new_rclone_remote(new_remote: NewRCloneRemote, app: AppHandle) -> bool {
    if new_remote.url.is_empty() || !new_remote.url.contains("://") {
        println!("A URL is required.");
        return false;
    }

    if new_remote.name.is_empty() {
        println!("An account name is required.");
        return false;
    }

    if new_remote.remote_directories.len() == 0 {
        println!("At least one remote directory is required.");
        return false;
    }

    if new_remote.local_directory.is_empty() {
        println!("A local directory is required.");
        return false;
    }

    if !path::Path::new(&new_remote.local_directory).exists() {
        println!("An existing local directory is required.");
        return false;
    }

    let output = Command::new("rclone")
        .args([
            "config",
            "create",
            &new_remote.name,
            "webdav",
            &format!("url={}", new_remote.url),
            &format!("user={}", new_remote.username),
            &format!("pass={}", new_remote.password),
            "vendor=fastmail", // technically this should be vendor=other, but that wouldn't work with rclone bisync
            "--non-interactive",
            "--obscure",
        ])
        .output()
        .expect("failed to execute rclone");

    println!(
        "rclone output: {} {}",
        String::from_utf8(output.stdout).unwrap(),
        String::from_utf8(output.stderr).unwrap()
    );

    run_first_sync_for_account(&ConfigAccount {
        remote_directories: new_remote.remote_directories.to_vec(),
        last_sync_time: "".to_string(),
        rclone: ConfigAccountRClone {
            remote_name: new_remote.name.to_string(),
            local_directory: new_remote.local_directory.to_string(),
        },
    });

    return add_remote_to_json_config(&app, new_remote);
}

#[tauri::command]
fn update_rclone_remote(updated_remote: UpdatedRCloneRemote, app: AppHandle) -> bool {
    if updated_remote.remote_directories.len() == 0 {
        println!("At least one remote directory is required.");
        return false;
    }

    if updated_remote.local_directory.is_empty() {
        println!("A local directory is required.");
        return false;
    }

    if !path::Path::new(&updated_remote.local_directory).exists() {
        println!("An existing local directory is required.");
        return false;
    }

    // TODO: If remote directories were removed, remove them locally (comment out the code after).

    run_first_sync_for_account(&ConfigAccount {
        remote_directories: updated_remote.remote_directories.to_vec(),
        last_sync_time: "".to_string(),
        rclone: ConfigAccountRClone {
            remote_name: updated_remote.name.to_string(),
            local_directory: updated_remote.local_directory.to_string(),
        },
    });

    return update_remote_in_json_config(&app, updated_remote);
}

#[tauri::command]
fn delete_rclone_remote(remote_to_delete: UpdatedRCloneRemote, app: AppHandle) -> bool {
    // NOTE: Removing directories programmatically feels dangerous. For now, let the user do it manually.
    // if path::Path::new(&remote_to_delete.local_directory).exists() {
    //   fs::remove_dir_all(&remote_to_delete.local_directory).unwrap();
    // }

    let output = Command::new("rclone")
        .args(["config", "delete", &remote_to_delete.name])
        .output()
        .expect("failed to execute rclone");

    println!(
        "rclone output: {} {}",
        String::from_utf8(output.stdout).unwrap(),
        String::from_utf8(output.stderr).unwrap()
    );

    return delete_remote_in_json_config(&app, remote_to_delete);
}

#[tauri::command]
fn check_if_local_directory_is_empty(directory: String) -> bool {
    let local_directory_path_buffer = path::Path::new(&directory);

    if !local_directory_path_buffer.exists() {
        return false;
    }

    if local_directory_path_buffer
        .read_dir()
        .map(|mut entry| entry.next().is_none())
        .unwrap_or(false)
    {
        return true;
    }

    return false;
}

fn get_config_file_path(app: &AppHandle) -> String {
    let binding = app.path_resolver().app_data_dir().unwrap();
    let app_data_dir = binding.to_str().unwrap();

    // Make sure the app data dir exists
    fs::create_dir_all(&app_data_dir).unwrap();

    let config_file_name = "config.json";
    let config_path_binding = Path::new(app_data_dir).join(config_file_name);
    let config_path = config_path_binding.to_str().unwrap();

    return config_path.to_string();
}

fn get_json_config(app: &AppHandle) -> Config {
    let config_path = get_config_file_path(app);

    if !path::Path::new(&config_path).exists() {
        let config = Config {
            accounts: Vec::new(),
        };
        let config_json = serde_json::to_string(&config).unwrap();
        fs::write(config_path, config_json).unwrap();
        return config;
    }

    let config_json = fs::read_to_string(config_path).unwrap();

    let config: Config = serde_json::from_str(&config_json).unwrap();

    return config;
}

fn add_remote_to_json_config(app: &AppHandle, new_remote: NewRCloneRemote) -> bool {
    let config_path = get_config_file_path(app);

    let mut config = get_json_config(app);

    let now = SystemTime::now();
    let utc_now: DateTime<Utc> = now.into();
    let last_sync_time = utc_now.to_rfc3339();

    config.accounts.push(ConfigAccount {
        remote_directories: new_remote.remote_directories,
        rclone: ConfigAccountRClone {
            remote_name: new_remote.name,
            local_directory: new_remote.local_directory,
        },
        last_sync_time,
    });

    let config_json = serde_json::to_string(&config).unwrap();
    fs::write(config_path, config_json).unwrap();

    return true;
}

fn update_remote_in_json_config(app: &AppHandle, updated_remote: UpdatedRCloneRemote) -> bool {
    let config_path = get_config_file_path(app);

    let mut config = get_json_config(app);

    let now = SystemTime::now();
    let utc_now: DateTime<Utc> = now.into();
    let last_sync_time = utc_now.to_rfc3339();

    let config_account_index = config
        .accounts
        .iter()
        .position(|account| *account.rclone.remote_name == updated_remote.name)
        .unwrap();

    let mut updated_config_account = config.accounts.get(config_account_index).unwrap().clone();
    updated_config_account.remote_directories = updated_remote.remote_directories;
    updated_config_account.rclone.local_directory = updated_remote.local_directory;
    updated_config_account.last_sync_time = last_sync_time;

    config.accounts[config_account_index] = updated_config_account;

    let config_json = serde_json::to_string(&config).unwrap();
    fs::write(config_path, config_json).unwrap();

    return true;
}

fn delete_remote_in_json_config(app: &AppHandle, remote_to_delete: UpdatedRCloneRemote) -> bool {
    let config_path = get_config_file_path(app);

    let mut config = get_json_config(app);

    let config_account_index = config
        .accounts
        .iter()
        .position(|account| *account.rclone.remote_name == remote_to_delete.name)
        .unwrap();

    config.accounts.remove(config_account_index);

    let config_json = serde_json::to_string(&config).unwrap();
    fs::write(config_path, config_json).unwrap();

    return true;
}

fn update_sync_time_in_json_config(app: &AppHandle, account_to_update: &ConfigAccount) -> bool {
    let config_path = get_config_file_path(app);

    let mut config = get_json_config(app);

    let now = SystemTime::now();
    let utc_now: DateTime<Utc> = now.into();
    let last_sync_time = utc_now.to_rfc3339();

    let config_account_index = config
        .accounts
        .iter()
        .position(|account| *account.rclone.remote_name == account_to_update.rclone.remote_name)
        .unwrap();

    let mut updated_config_account = config.accounts.get(config_account_index).unwrap().clone();
    updated_config_account.last_sync_time = last_sync_time;

    config.accounts[config_account_index] = updated_config_account;

    let config_json = serde_json::to_string(&config).unwrap();
    fs::write(config_path, config_json).unwrap();

    return true;
}

fn run_first_sync_for_account(account: &ConfigAccount) {
    for remote_directory in &account.remote_directories {
        let remote_with_directory =
            format!("{}:/{}/", account.rclone.remote_name, remote_directory);
        let local_with_directory =
            format!("{}/{}/", account.rclone.local_directory, remote_directory);

        // rclone bisync needs the local directory to exist, unlike copy or sync
        fs::create_dir_all(&local_with_directory).unwrap();

        let output = Command::new("rclone")
            .args([
                "bisync",
                "-v",
                &remote_with_directory,
                &local_with_directory,
                "--resync",
            ])
            .output()
            .expect("failed to execute rclone");

        println!(
            "rclone command: {} {} {} --resync",
            "rclone bisync -v", remote_with_directory, local_with_directory
        );
        println!(
            "rclone output: {} {}",
            String::from_utf8(output.stdout).unwrap(),
            String::from_utf8(output.stderr).unwrap()
        );
    }
}

fn run_sync_for_account(account: &ConfigAccount) {
    for remote_directory in &account.remote_directories {
        let remote_with_directory =
            format!("{}:/{}/", account.rclone.remote_name, remote_directory);
        let local_with_directory =
            format!("{}/{}/", account.rclone.local_directory, remote_directory);

        let output = Command::new("rclone")
            .args([
                "bisync",
                "-v",
                &remote_with_directory,
                &local_with_directory,
            ])
            .output()
            .expect("failed to execute rclone");

        println!(
            "rclone command: {} {} {}",
            "rclone bisync -v", remote_with_directory, local_with_directory
        );
        println!(
            "rclone output: {} {}",
            String::from_utf8(output.stdout).unwrap(),
            String::from_utf8(output.stderr).unwrap()
        );
    }
}

fn show_or_hide_main_window(app: &AppHandle) {
    let existing_window = app.get_window("main");
    if existing_window.is_some() {
        let window = existing_window.unwrap();

        let new_title = if window.is_visible().unwrap() {
            window.hide().unwrap();
            "Show"
        } else {
            window.show().unwrap();
            window.set_focus().unwrap();
            "Hide"
        };

        app.tray_handle()
            .get_item("show_or_hide")
            .set_title(new_title)
            .unwrap();

        return;
    }

    let window = tauri::WindowBuilder::from_config(
        app,
        app.clone().config().tauri.windows.get(0).unwrap().clone(),
    )
    .build()
    .unwrap();

    let new_title = "Hide";
    window.show().unwrap();
    window.set_focus().unwrap();

    app.tray_handle()
        .get_item("show_or_hide")
        .set_title(new_title)
        .unwrap();
}

fn main() {
    let show_or_hide = CustomMenuItem::new("show_or_hide".to_string(), "Hide");
    let force_sync = CustomMenuItem::new("force_sync".to_string(), "Force Sync");
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let tray_menu = SystemTrayMenu::new()
        .add_item(show_or_hide)
        .add_item(force_sync)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);
    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show_or_hide" => {
                    show_or_hide_main_window(app);
                }
                "force_sync" => {
                    run_sync(app.clone());
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            },
            _ => {}
        })
        .on_window_event(|event| match event.event() {
            // Keeps app running when regularly "closed"
            tauri::WindowEvent::CloseRequested { .. } => {
                event
                    .window()
                    .app_handle()
                    .tray_handle()
                    .get_item("show_or_hide")
                    .set_title("Show")
                    .unwrap();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            run_sync,
            add_new_rclone_remote,
            update_rclone_remote,
            delete_rclone_remote,
            check_if_local_directory_is_empty
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, event| match event {
            // Keeps app running when regularly "closed"
            tauri::RunEvent::ExitRequested { api, .. } => {
                api.prevent_exit();
            }

            _ => {}
        });
}
