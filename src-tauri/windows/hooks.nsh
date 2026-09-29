!include "LogicLib.nsh"

; MIAO Motion virtual camera lifecycle hooks.
; - The DirectShow component is machine-wide (HKLM + Program Files) and needs UAC.
; - HKCU "Software\MIAO Motion\Camera" records what *this* Windows user did:
;     RegisteredByUser = 1  this user installed the component (written by camera-register.exe)
;     ReinstallPending = 1  this user's uninstaller removed it; the next install restores it
; - The uninstaller never blocks on the component: a failed or skipped removal leaves
;   only the protected, administrator-owned copy behind.

!define MIAO_CAMERA_SERVER_KEY "SOFTWARE\Classes\CLSID\{DA9CE316-89EF-4AD6-A156-459B271DF409}\InprocServer32"
!define MIAO_CAMERA_PROTECTED_DLL "$PROGRAMFILES64\MIAO Motion Camera\softcam.dll"
!define MIAO_CAMERA_USER_KEY "Software\MIAO Motion\Camera"
!define MIAO_CAMERA_HELPER "$INSTDIR\camera\camera-register.exe"

; A GUI or passive install can run the previous uninstaller (without /UPDATE) before
; any section executes, and older uninstallers removed the component without leaving
; ReinstallPending. Remember the state before that happens so POSTINSTALL can restore it.
; .onGUIInit is not called in silent mode, where the previous uninstaller is not run.
Var MiaoCameraBefore
!define MUI_CUSTOMFUNCTION_GUIINIT MiaoCameraSnapshot
Function MiaoCameraSnapshot
  SetRegView 64
  ReadRegStr $MiaoCameraBefore HKLM "${MIAO_CAMERA_SERVER_KEY}" ""
  SetRegView lastused
FunctionEnd

; Runs the bundled helper. RESULT receives the exit code, or "error" when it cannot start.
!macro MIAO_CAMERA_RUN MIAO_ACTION MIAO_RESULT
  ClearErrors
  ExecWait '"${MIAO_CAMERA_HELPER}" ${MIAO_ACTION}' ${MIAO_RESULT}
  ${If} ${Errors}
    StrCpy ${MIAO_RESULT} "error"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Automatic updates keep the component; the new version reuses it.
  ${If} $UpdateMode <> 1
    SetRegView 64
    ReadRegStr $0 HKLM "${MIAO_CAMERA_SERVER_KEY}" ""
    ReadRegDWORD $1 HKCU "${MIAO_CAMERA_USER_KEY}" "RegisteredByUser"
    StrCpy $2 0
    ${If} $0 == ""
      ; Nothing registered: drop a stale marker.
      DeleteRegValue HKCU "${MIAO_CAMERA_USER_KEY}" "RegisteredByUser"
    ${ElseIf} $1 = 1
      ; This Windows user installed it.
      StrCpy $2 1
    ${ElseIf} $0 != "${MIAO_CAMERA_PROTECTED_DLL}"
      ; Legacy registration pointing into this user's files (v0.3.0-beta).
      ${If} $0 == "$INSTDIR\camera\softcam.dll"
        StrCpy $2 1
      ${Else}
        StrLen $3 "$LOCALAPPDATA\"
        StrCpy $3 $0 $3
        ${If} $3 == "$LOCALAPPDATA\"
          StrCpy $2 1
        ${EndIf}
      ${EndIf}
    ${EndIf}
    ; Otherwise another user installed the protected component: leave it alone.
    ${If} $2 = 1
      DetailPrint "正在注销喵动虚拟摄像头"
      !insertmacro MIAO_CAMERA_RUN "unregister-silent" $3
      ${If} $3 == "0"
        WriteRegDWORD HKCU "${MIAO_CAMERA_USER_KEY}" "ReinstallPending" 1
        DeleteRegValue HKCU "${MIAO_CAMERA_USER_KEY}" "RegisteredByUser"
      ${Else}
        DetailPrint "虚拟摄像头注销未完成（$3），继续卸载时组件将保留"
        ${If} $0 == "${MIAO_CAMERA_PROTECTED_DLL}"
          MessageBox MB_YESNO|MB_ICONEXCLAMATION "喵动虚拟摄像头组件没有注销（可能取消了管理员确认，或接收软件仍在使用它）。$\r$\n$\r$\n是否仍然卸载喵动？$\r$\n$\r$\n选择“是”：继续卸载。摄像头组件会保留在只有管理员能修改的受保护目录中，不影响系统安全；以后可以重新安装喵动，在“原生虚拟摄像头（Windows）”中点“卸载摄像头组件”清理，或请电脑管理员清理。$\r$\n选择“否”：取消卸载，关闭接收软件后再试。" /SD IDYES IDYES miao_camera_uninstall_continue
        ${Else}
          MessageBox MB_YESNO|MB_ICONEXCLAMATION "旧版喵动虚拟摄像头组件没有注销（可能取消了管理员确认）。$\r$\n$\r$\n注意：旧版组件位于普通用户可修改的目录，保留它存在安全风险。建议选择“否”，关闭接收软件后重新卸载并完成管理员确认。$\r$\n$\r$\n是否仍然卸载喵动？选择“是”后，请重新安装喵动，在“原生虚拟摄像头（Windows）”中点“卸载摄像头组件”清理旧组件，或请电脑管理员清理。" /SD IDYES IDYES miao_camera_uninstall_continue
        ${EndIf}
        SetRegView lastused
        Abort
        miao_camera_uninstall_continue:
      ${EndIf}
    ${EndIf}
    SetRegView lastused
  ${EndIf}
  ; Missing registry values set the error flag; do not leak it into the template.
  ClearErrors
!macroend

!macro NSIS_HOOK_POSTINSTALL
  SetRegView 64
  ReadRegStr $0 HKLM "${MIAO_CAMERA_SERVER_KEY}" ""
  ReadRegDWORD $2 HKCU "${MIAO_CAMERA_USER_KEY}" "ReinstallPending"
  ${If} $0 != ""
  ${AndIf} $0 != "${MIAO_CAMERA_PROTECTED_DLL}"
    ; Legacy registration of a user-writable DLL: move it to the protected directory.
    DetailPrint "正在把旧版虚拟摄像头迁移到受保护目录"
    !insertmacro MIAO_CAMERA_RUN "register-silent" $1
    ${If} $1 != "0"
      ; Try to drop the unsafe registration unless the user just declined UAC.
      ${If} $1 != "1223"
        !insertmacro MIAO_CAMERA_RUN "unregister-silent" $3
      ${EndIf}
      ReadRegStr $0 HKLM "${MIAO_CAMERA_SERVER_KEY}" ""
      ${If} $0 != ""
      ${AndIf} $0 != "${MIAO_CAMERA_PROTECTED_DLL}"
        DetailPrint "旧版虚拟摄像头迁移失败（$1），仍位于不受保护的目录"
        MessageBox MB_ICONEXCLAMATION "旧版喵动虚拟摄像头没有迁移到受保护目录（可能取消了管理员确认）。$\r$\n$\r$\n注意：旧版组件位于普通用户可修改的目录，继续保留存在安全风险。请打开喵动，在“原生虚拟摄像头（Windows）”中点“卸载摄像头组件”并完成管理员确认来清理旧组件，需要时再重新安装摄像头组件。" /SD IDOK
      ${Else}
        DetailPrint "旧版虚拟摄像头已移除，新组件未安装（$1）"
        MessageBox MB_ICONEXCLAMATION "旧版虚拟摄像头已移除，但新组件没有安装完成。需要时请在喵动“原生虚拟摄像头（Windows）”中重新安装摄像头组件；其他功能可正常使用。" /SD IDOK
      ${EndIf}
    ${EndIf}
  ${ElseIf} $0 == ""
    ; Restore a component that this user's uninstaller (or an older one run by this
    ; installer during an upgrade) removed.
    ${If} $2 = 1
    ${OrIf} $MiaoCameraBefore != ""
      DetailPrint "正在恢复喵动虚拟摄像头"
      !insertmacro MIAO_CAMERA_RUN "register-silent" $1
      ${If} $1 == "1223"
        DetailPrint "已取消管理员确认，未恢复虚拟摄像头"
      ${ElseIf} $1 != "0"
        DetailPrint "虚拟摄像头恢复失败（$1）"
        MessageBox MB_ICONEXCLAMATION "喵动虚拟摄像头没有恢复。需要时请在喵动“原生虚拟摄像头（Windows）”中重新安装摄像头组件；其他功能可正常使用。" /SD IDOK
      ${EndIf}
    ${EndIf}
  ${EndIf}
  ; Protected registration (for example installed by another Windows user): nothing to do.
  DeleteRegValue HKCU "${MIAO_CAMERA_USER_KEY}" "ReinstallPending"
  SetRegView lastused
  ClearErrors
!macroend
