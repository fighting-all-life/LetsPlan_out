!macro customInstall
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    Push $0
    ReadEnvStr $0 "APPDATA"
    ${if} $0 == ""
      StrCpy $0 "$APPDATA"
    ${endIf}
    !ifdef MENU_FILENAME
      CreateDirectory "$0\Microsoft\Windows\Start Menu\Programs\${MENU_FILENAME}"
      CreateShortCut "$0\Microsoft\Windows\Start Menu\Programs\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$0\Microsoft\Windows\Start Menu\Programs\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    !else
      CreateDirectory "$0\Microsoft\Windows\Start Menu\Programs"
      CreateShortCut "$0\Microsoft\Windows\Start Menu\Programs\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$0\Microsoft\Windows\Start Menu\Programs\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    !endif
    Pop $0
  !endif
!macroend

!macro customUnInstall
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    Push $0
    ReadEnvStr $0 "APPDATA"
    ${if} $0 == ""
      StrCpy $0 "$APPDATA"
    ${endIf}
    !ifdef MENU_FILENAME
      Delete "$0\Microsoft\Windows\Start Menu\Programs\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk"
      RMDir "$0\Microsoft\Windows\Start Menu\Programs\${MENU_FILENAME}"
    !else
      Delete "$0\Microsoft\Windows\Start Menu\Programs\${SHORTCUT_NAME}.lnk"
    !endif
    Pop $0
  !endif
!macroend
