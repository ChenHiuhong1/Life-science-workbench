#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct BackendProcess(Mutex<Option<CommandChild>>);

fn backend_ready() -> bool {
    let url = "http://127.0.0.1:8000/api/health";
    reqwest::blocking::get(url)
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

fn wait_for_backend() {
    for _ in 0..40 {
        if backend_ready() {
            log::info!("Backend is ready.");
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    log::warn!("Backend did not report ready before timeout.");
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            let app_home = std::env::var_os("SCIENCE_WORKBENCH_HOME")
                .map(PathBuf::from)
                .or_else(|| {
                    std::env::var_os("APPDATA")
                        .map(|base| PathBuf::from(base).join("ScienceWorkbench"))
                })
                .unwrap_or_else(|| {
                    app.path().app_data_dir().unwrap_or_else(|_| {
                        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
                    })
                });
            let _ = std::fs::create_dir_all(&app_home);
            std::env::set_var("SCIENCE_WORKBENCH_HOME", &app_home);
            log::info!("Science Workbench home: {:?}", app_home);

            if !cfg!(debug_assertions) {
                if backend_ready() {
                    log::info!("Backend is already running.");
                    return Ok(());
                }

                let app_handle = app.handle().clone();
                match app_handle.shell().sidecar("science-backend") {
                    Ok(command) => match command.spawn() {
                        Ok((mut rx, child)) => {
                            log::info!("Backend sidecar started.");
                            let event_handle = app_handle.clone();
                            tauri::async_runtime::spawn(async move {
                                while let Some(event) = rx.recv().await {
                                    match event {
                                        CommandEvent::Stdout(line) => {
                                            log::info!(
                                                "backend: {}",
                                                String::from_utf8_lossy(&line)
                                            );
                                        }
                                        CommandEvent::Stderr(line) => {
                                            log::warn!(
                                                "backend: {}",
                                                String::from_utf8_lossy(&line)
                                            );
                                        }
                                        _ => {}
                                    }
                                }
                                let _ = event_handle.emit("backend-stopped", ());
                            });

                            if let Some(state) = app_handle.try_state::<BackendProcess>() {
                                if let Ok(mut guard) = state.0.lock() {
                                    *guard = Some(child);
                                }
                            }
                            wait_for_backend();
                        }
                        Err(error) => {
                            log::error!("Failed to spawn backend sidecar: {}", error);
                        }
                    },
                    Err(error) => {
                        log::error!("Failed to create backend sidecar command: {}", error);
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<BackendProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                            log::info!("Backend sidecar stopped.");
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
