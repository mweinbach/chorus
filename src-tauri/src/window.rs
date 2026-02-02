#![allow(unexpected_cfgs)]

#[cfg(target_os = "macos")]
#[allow(deprecated)]
use tauri_nspanel::{
    cocoa::{
        appkit::NSWindowCollectionBehavior, base::id as cocoa_id, foundation::NSSize,
        foundation::NSString,
    },
    objc::{class, msg_send, sel, sel_impl},
    panel_delegate, Panel, WebviewWindowExt as PanelWebviewWindowExt,
};

use tauri::{Emitter, Manager, Runtime, WebviewWindow};
use thiserror::Error;
use window_vibrancy::*;

type TauriError = tauri::Error;

#[derive(Error, Debug)]
enum Error {
    #[error("Unable to convert window to panel")]
    Panel,
}

#[cfg(target_os = "macos")]
pub trait WebviewWindowExt {
    fn to_spotlight_panel(&self, is_dark_mode: bool) -> tauri::Result<Panel>;
    fn update_theme(&self, is_dark_mode: bool);
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
impl<R: Runtime> WebviewWindowExt for WebviewWindow<R> {
    fn to_spotlight_panel(&self, is_dark_mode: bool) -> tauri::Result<Panel> {
        apply_vibrancy(
            self,
            NSVisualEffectMaterial::Popover,
            Some(NSVisualEffectState::Active),
            Some(12.0),
        )
        .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

        // Get the native window handle
        if let Ok(handle) = self.ns_window() {
            let handle = handle as cocoa_id;
            unsafe {
                let dark_mode = NSString::alloc(handle).init_str(if is_dark_mode {
                    "NSAppearanceNameDarkAqua"
                } else {
                    "NSAppearanceNameAqua"
                });
                let appearance: cocoa_id =
                    msg_send![class!(NSAppearance), appearanceNamed: dark_mode];
                let _: () = msg_send![handle, setAppearance: appearance];
            }
        }

        // Convert window to panel
        let panel = self
            .to_panel()
            .map_err(|_| TauriError::Anyhow(Error::Panel.into()))?;

        // Set panel level to status window level (above full screen, below system dialogs)
        panel.set_level(25); // NSStatusWindowLevel, will appear above full screen windows but below system UI

        // Prevent the panel from activating the application
        #[allow(non_upper_case_globals)]
        const NSWindowStyleMaskNonactivatingPanel: i32 = 1 << 7;
        const NS_WINDOW_STYLE_MASK_RESIZABLE: i32 = 1 << 3;
        const NSWINDOW_COLLECTION_BEHAVIOR_TRANSIENT: i32 = 1 << 3;
        const NSWINDOW_COLLECTION_BEHAVIOR_IGNORES_CYCLE: i32 = 1 << 6;
        const NSWINDOW_COLLECTION_BEHAVIOR_STATIONARY: i32 = 1 << 4;
        const NSWINDOW_COLLECTION_BEHAVIOR_CANJIMP_TO_ACTIVE_SPACE: i32 = 1 << 0;
        const NSWINDOW_COLLECTION_BEHAVIOR_VISIBLE_ON_ALL_SPACES: i32 = 1 << 8;

        // Set style mask to prevent app activation and allow resizing
        panel.set_style_mask(NSWindowStyleMaskNonactivatingPanel | NS_WINDOW_STYLE_MASK_RESIZABLE);

        // Set collection behavior to make the panel float above all windows and spaces
        panel.set_collection_behaviour(NSWindowCollectionBehavior::from_bits_retain(
            (NSWINDOW_COLLECTION_BEHAVIOR_TRANSIENT
                | NSWINDOW_COLLECTION_BEHAVIOR_IGNORES_CYCLE
                | NSWINDOW_COLLECTION_BEHAVIOR_STATIONARY
                | NSWINDOW_COLLECTION_BEHAVIOR_CANJIMP_TO_ACTIVE_SPACE
                | NSWINDOW_COLLECTION_BEHAVIOR_VISIBLE_ON_ALL_SPACES) as u64,
        ));

        // Set maximum and minimum size for the panel
        unsafe {
            if let Ok(handle) = self.ns_window() {
                let handle = handle as cocoa_id;
                let max_size = NSSize::new(900.0, 1200.0);
                let min_size = NSSize::new(300.0, 200.0);
                let _: () = msg_send![handle, setMaxSize: max_size];
                let _: () = msg_send![handle, setMinSize: min_size];
            }
        }

        // Additional macOS-specific settings
        unsafe {
            if let Ok(handle) = self.ns_window() {
                let handle = handle as cocoa_id;
                let _: () = msg_send![handle, setCanHide: 0];
                let _: () = msg_send![handle, setHidesOnDeactivate: 0];
            }
        }

        // Set up a delegate to handle key window events for the panel
        //
        // This delegate listens for two specific events:
        // 1. When the panel becomes the key window
        // 2. When the panel resigns as the key window
        //
        // For each event, it emits a corresponding custom event to the app,
        // allowing other parts of the application to react to these panel state changes.

        #[allow(unexpected_cfgs)]
        let panel_delegate = panel_delegate!(SpotlightPanelDelegate {
            window_did_resign_key,
            window_did_become_key
        });

        let app_handle = self.app_handle().clone();

        let label = self.label().to_string();

        panel_delegate.set_listener(Box::new(move |delegate_name: String| {
            match delegate_name.as_str() {
                "window_did_become_key" => {
                    let _ = app_handle.emit(format!("{}_panel_did_become_key", label).as_str(), ());
                }
                "window_did_resign_key" => {
                    let _ = app_handle.emit(format!("{}_panel_did_resign_key", label).as_str(), ());
                }
                _ => (),
            }
        }));

        panel.set_delegate(panel_delegate);

        Ok(panel)
    }

    fn update_theme(&self, is_dark_mode: bool) {
        if let Ok(handle) = self.ns_window() {
            let handle = handle as cocoa_id;
            unsafe {
                let dark_mode = NSString::alloc(handle).init_str(if is_dark_mode {
                    "NSAppearanceNameDarkAqua"
                } else {
                    "NSAppearanceNameAqua"
                });
                let appearance: cocoa_id =
                    msg_send![class!(NSAppearance), appearanceNamed: dark_mode];
                let _: () = msg_send![handle, setAppearance: appearance];
            }
        }
    }
}
