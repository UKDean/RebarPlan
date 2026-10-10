//! "Send by email": hand a file to the user's mail program as an attachment.
//!
//! On Windows this uses Simple MAPI (MAPISendMailW), which classic Outlook,
//! Thunderbird and most desktop mail programs register. It opens a new
//! message with the file attached and lets the user pick the recipient.
//! When no MAPI program is installed the command returns an error and the
//! front end falls back to a mailto: link plus the file in Downloads.

use std::path::Path;

#[tauri::command]
pub async fn send_mail(subject: String, body: String, file_name: String, bytes: Vec<u8>) -> Result<(), String> {
    let dir = std::env::temp_dir().join("RebarPlan");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe: String = file_name
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) || c.is_control() { '-' } else { c })
        .collect();
    let path = dir.join(if safe.is_empty() { "RebarPlan.xlsx".into() } else { safe });
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    // MAPISendMailW blocks until the compose window closes.
    tauri::async_runtime::spawn_blocking(move || platform::send(&subject, &body, &path))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(windows)]
mod platform {
    use std::{ffi::c_void, os::windows::ffi::OsStrExt, path::Path, ptr};

    #[repr(C)]
    struct MapiFileDescW {
        ul_reserved: u32,
        fl_flags: u32,
        n_position: u32,
        lpsz_path_name: *const u16,
        lpsz_file_name: *const u16,
        lp_file_type: *mut c_void,
    }

    #[repr(C)]
    struct MapiMessageW {
        ul_reserved: u32,
        lpsz_subject: *const u16,
        lpsz_note_text: *const u16,
        lpsz_message_type: *const u16,
        lpsz_date_received: *const u16,
        lpsz_conversation_id: *const u16,
        fl_flags: u32,
        lp_originator: *mut c_void,
        n_recip_count: u32,
        lp_recips: *mut c_void,
        n_file_count: u32,
        lp_files: *mut MapiFileDescW,
    }

    type MapiSendMailW = unsafe extern "system" fn(usize, usize, *mut MapiMessageW, u32, u32) -> u32;

    const MAPI_LOGON_UI: u32 = 0x1;
    const MAPI_DIALOG: u32 = 0x8;
    const SUCCESS_SUCCESS: u32 = 0;
    const MAPI_USER_ABORT: u32 = 1;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(Some(0)).collect()
    }

    pub fn send(subject: &str, body: &str, path: &Path) -> Result<(), String> {
        // SAFETY: MAPI32.dll is the system Simple MAPI stub; the symbol has the
        // documented MAPISendMailW signature, and every pointer below stays
        // alive until the call returns.
        let lib = unsafe { libloading::Library::new("MAPI32.dll") }.map_err(|e| e.to_string())?;
        let send_mail: libloading::Symbol<MapiSendMailW> =
            unsafe { lib.get(b"MAPISendMailW\0") }.map_err(|e| e.to_string())?;

        let subject = wide(subject);
        let body = wide(body);
        let full_path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let name = wide(&path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default());

        let mut file = MapiFileDescW {
            ul_reserved: 0,
            fl_flags: 0,
            n_position: u32::MAX,
            lpsz_path_name: full_path.as_ptr(),
            lpsz_file_name: name.as_ptr(),
            lp_file_type: ptr::null_mut(),
        };
        let mut message = MapiMessageW {
            ul_reserved: 0,
            lpsz_subject: subject.as_ptr(),
            lpsz_note_text: body.as_ptr(),
            lpsz_message_type: ptr::null(),
            lpsz_date_received: ptr::null(),
            lpsz_conversation_id: ptr::null(),
            fl_flags: 0,
            lp_originator: ptr::null_mut(),
            n_recip_count: 0,
            lp_recips: ptr::null_mut(),
            n_file_count: 1,
            lp_files: &mut file,
        };
        match unsafe { send_mail(0, 0, &mut message, MAPI_LOGON_UI | MAPI_DIALOG, 0) } {
            SUCCESS_SUCCESS | MAPI_USER_ABORT => Ok(()),
            code => Err(format!("MAPI error {code}")),
        }
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn send(_subject: &str, _body: &str, _path: &super::Path) -> Result<(), String> {
        Err("Simple MAPI is only available on Windows".into())
    }
}
