// KitchenOS desktop shell.
//
// This process's only job is: start the local Python API server as a
// child process the moment the window opens, and make sure it's killed
// when the window closes. The React frontend (core/frontend) then talks
// to that server over http://127.0.0.1 exactly like it does in dev mode
// against `python -m flask run` — see core/frontend/.env.desktop.
//
// No network calls happen from this file. That's the point: the free
// build's Rust shell doesn't know Convex or Clerk exist (Hard Rule 1).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;
use std::sync::Mutex;

struct SidecarHandle(Mutex<Option<CommandChild>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarHandle(Mutex::new(None)))
        .setup(|app| {
            let shell = app.shell();
            let (_rx, child) = shell
                .sidecar("kitchenos-server")
                .expect("kitchenos-server binary not found — see desktop/README.md's PyInstaller step")
                .spawn()
                .expect("failed to start the local KitchenOS server");

            app.state::<SidecarHandle>()
                .0
                .lock()
                .unwrap()
                .replace(child);

            Ok(())
        })
        .on_window_event(|window, event| {
            // Kill the sidecar the moment the window closes — this is a
            // single-window desktop app, so "window closed" == "app quit",
            // and an orphaned Python process bound to a local port would
            // otherwise sit there until the next reboot.
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(handle) = window.app_handle().try_state::<SidecarHandle>() {
                    if let Some(child) = handle.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running KitchenOS");
}
