' Launches start-rinkscreens.bat with no visible console window, so the
' scheduled auto-start task doesn't leave a cmd.exe window on screen.
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
shell.Run """" & folder & "\start-rinkscreens.bat""", 0, False
