!include "LogicLib.nsh"
!macro NSIS_HOOK_PREUNINSTALL
  SetRegView 64
  ReadRegStr $0 HKLM "SOFTWARE\Classes\CLSID\{DA9CE316-89EF-4AD6-A156-459B271DF409}\InprocServer32" ""
  ${If} $0 != ""
    ExecWait '"$INSTDIR\camera\camera-register.exe" unregister-silent' $1
    ${If} $1 != 0
      MessageBox MB_ICONSTOP "无法注销喵动虚拟摄像头。请完成管理员权限确认并关闭接收软件，再重新卸载。"
      Abort
    ${EndIf}
  ${EndIf}
!macroend
!macro NSIS_HOOK_POSTINSTALL
  SetRegView 64
  ReadRegStr $0 HKLM "SOFTWARE\Classes\CLSID\{DA9CE316-89EF-4AD6-A156-459B271DF409}\InprocServer32" ""
  ${If} $0 != ""
    ExecWait '"$INSTDIR\camera\camera-register.exe" register-silent' $1
    ${If} $1 != 0
      ExecWait '"$INSTDIR\camera\camera-register.exe" unregister-silent' $1
      MessageBox MB_ICONEXCLAMATION "虚拟摄像头迁移未完成。请在喵动中重新安装摄像头组件；其他功能可正常使用。"
    ${EndIf}
  ${EndIf}
!macroend
